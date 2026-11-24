import { describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";
import { authenticate } from "../worker/auth";

const TEAM = "axis-test.cloudflareaccess.com";
const AUD = "aud-staging";
const base = { ENVIRONMENT: "staging", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, OWNER_EMAIL: "Owner@Example.invalid" };

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const getKey = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown> = {}, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT({ email: "owner@example.invalid", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? `https://${TEAM}`)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(privateKey);
  return { getKey, sign };
}
const req = (token?: string, url = "https://axis-staging.frameworktools.ca/") =>
  new Request(url, { headers: token ? { "Cf-Access-Jwt-Assertion": token } : {} });

describe("authenticate (Cloudflare Access JWT)", () => {
  it("accepts a valid token for the owner (case-insensitive email)", async () => {
    const { getKey, sign } = await setup();
    const r = await authenticate(req(await sign()), base, getKey);
    expect(r).toMatchObject({ ok: true, via: "access", email: "owner@example.invalid" });
  });
  it("rejects a missing token", async () => {
    expect(await authenticate(req(), base)).toMatchObject({ ok: false, status: 401 });
  });
  it("rejects wrong audience, wrong issuer and expired tokens", async () => {
    const { getKey, sign } = await setup();
    for (const t of [await sign({}, { aud: "other" }), await sign({}, { iss: "https://evil.example" }), await sign({}, { exp: "-1m" })]) {
      expect(await authenticate(req(t), base, getKey)).toMatchObject({ ok: false, status: 401 });
    }
  });
  it("rejects a valid token for a different identity and a token without identity", async () => {
    const { getKey, sign } = await setup();
    expect(await authenticate(req(await sign({ email: "someone@else.invalid" })), base, getKey)).toMatchObject({ ok: false, status: 403 });
    expect(await authenticate(req(await sign({ email: undefined })), base, getKey)).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects a token signed by an unknown key", async () => {
    const { getKey } = await setup();
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "owner@example.invalid" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(`https://${TEAM}`).setAudience(AUD).setExpirationTime("5m").sign(other.privateKey);
    expect(await authenticate(req(forged), base, getKey)).toMatchObject({ ok: false, status: 401 });
  });
  it("fails closed on missing or placeholder configuration", async () => {
    const { getKey, sign } = await setup();
    const t = await sign();
    for (const bad of [{ ...base, ACCESS_AUD: undefined }, { ...base, OWNER_EMAIL: "" }, { ...base, ACCESS_TEAM_DOMAIN: "REPLACE_WITH_TEAM.cloudflareaccess.com" }, { ...base, ENVIRONMENT: "prod-typo" }]) {
      expect(await authenticate(req(t), bad, getKey)).toMatchObject({ ok: false, status: 500 });
    }
  });
  it("dev bypass works only for ENVIRONMENT=development on loopback hosts", async () => {
    const dev = { ENVIRONMENT: "development", OWNER_EMAIL: "dev@example.invalid" };
    expect(await authenticate(req(undefined, "http://localhost:8787/"), dev)).toMatchObject({ ok: true, via: "dev" });
    expect(await authenticate(req(undefined, "https://axis-staging.frameworktools.ca/"), dev)).toMatchObject({ ok: false, status: 403 });
    // A deployed environment never honours the bypass, even on a localhost-looking URL and with no token.
    expect(await authenticate(req(undefined, "http://localhost:8787/"), base)).toMatchObject({ ok: false, status: 401 });
  });
});

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Env } from "./env";

export type AuthResult =
  | { ok: true; email: string; via: "access" | "dev" }
  | { ok: false; status: 401 | 403 | 500; reason: string };

type AuthEnv = Pick<Env, "ENVIRONMENT" | "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD" | "OWNER_EMAIL">;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const jwksCache = new Map<string, JWTVerifyGetKey>();

function configured(v: string | undefined): v is string {
  return !!v && v.trim() !== "" && !v.startsWith("REPLACE_");
}

function jwksFor(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Authenticates a request. Fails closed: missing or placeholder configuration is a 500, never a pass.
 * `getKey` is injectable so tests can use a local key instead of the network.
 */
export async function authenticate(
  request: Request,
  env: AuthEnv,
  getKey?: JWTVerifyGetKey,
): Promise<AuthResult> {
  const url = new URL(request.url);

  // Local development only: needs ENVIRONMENT=development AND a loopback host. Deployed environments
  // set their own ENVIRONMENT and are reached through a real hostname, so this branch cannot be hit there.
  if (env.ENVIRONMENT === "development") {
    if (LOCAL_HOSTS.has(url.hostname)) {
      return { ok: true, email: (env.OWNER_EMAIL ?? "dev@localhost").toLowerCase(), via: "dev" };
    }
    return { ok: false, status: 403, reason: "development mode only serves loopback hosts" };
  }
  if (env.ENVIRONMENT !== "staging" && env.ENVIRONMENT !== "production") {
    return { ok: false, status: 500, reason: "unknown ENVIRONMENT" };
  }

  if (!configured(env.ACCESS_TEAM_DOMAIN) || !configured(env.ACCESS_AUD) || !configured(env.OWNER_EMAIL)) {
    return { ok: false, status: 500, reason: "access configuration incomplete" };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, status: 401, reason: "missing access token" };

  try {
    const { payload } = await jwtVerify(token, getKey ?? jwksFor(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email) return { ok: false, status: 403, reason: "token has no user identity" };
    if (email !== env.OWNER_EMAIL.trim().toLowerCase()) {
      return { ok: false, status: 403, reason: "identity not authorized" };
    }
    return { ok: true, email, via: "access" };
  } catch {
    return { ok: false, status: 401, reason: "invalid access token" };
  }
}

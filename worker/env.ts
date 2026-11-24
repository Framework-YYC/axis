export interface Env {
  ASSETS: Fetcher;
  AXIS_DB: D1Database;
  /** "development" | "staging" | "production". Anything else is treated as a misconfiguration. */
  ENVIRONMENT: string;
  /** e.g. "yourteam.cloudflareaccess.com" (not secret). */
  ACCESS_TEAM_DOMAIN?: string;
  /** Audience tag of this environment's Cloudflare Access application (not secret). */
  ACCESS_AUD?: string;
  /** The only identity allowed in. Stored as a Worker secret, never in the repository. */
  OWNER_EMAIL?: string;
}

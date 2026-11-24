# Plan: moving Orbis to its own domains (separate change, needs the owner's approval)

Status: **plan only**. Nothing here has been done. The app is branded Orbis everywhere users can see, but every infrastructure identifier is unchanged so nothing could break: Workers `axis-staging` and `axis-production`, D1 databases `axis-staging` and `axis-production`, hostnames `axis-staging.frameworktools.ca` and `axis.frameworktools.ca`, the GitHub repository `Framework-YYC/axis`, the Cloudflare Access applications, and the connector database name the assistants use.

## What depends on the current names
| Dependency | Where | Effect if it changes |
|---|---|---|
| Hostnames | `wrangler.jsonc` routes, `shared/environments.ts` (the environment switcher allow-list), Cloudflare Access applications and bypass paths (`/api/v1`, `/mcp`), `docs/*` | Sign-in, the switcher and every assistant/connector URL stop working until all are updated together |
| D1 database name and id | `wrangler.jsonc`, the assistant prompts ("axis-production", id) | Assistants query the database by name and id: renaming the database means re-pasting five prompts. The id never changes, so only the display name is at stake |
| Worker names | `wrangler.jsonc`, the deploy workflows | A renamed Worker is a new Worker: bindings, secrets, cron and routes must be recreated; the old one must be retired |
| MCP server name | `worker/routes/mcp.ts` (`serverInfo.name` is still `axis`) | ChatGPT connectors may list tools under the old name; changing it can require reconnecting the connector |
| PWA identity | `manifest.webmanifest` (`start_url` `/`, scope `/`) | A new hostname is a new origin: an installed Home Screen app on the old host keeps working but is a different app. Reinstall from the new host |
| Repository name | Actions secrets and `production`/`staging` environments | GitHub redirects the old name; secrets and environments carry over on rename |

## Recommended order (each step is safe to stop after)
1. **Decide the names** (suggested: `orbis.frameworktools.ca`, `orbis-staging.frameworktools.ca`; Workers `orbis-production` / `orbis-staging`; databases keep their ids, rename the display names last).
2. **Add, never replace.** Add the new hostnames as *additional* custom domains on the existing Workers, add them to the Access applications (same owner-only policy, same bypass paths for `/api/v1` and `/mcp`) and to the allow-list in `shared/environments.ts`. Both old and new hostnames then serve the same Worker and database.
3. **Verify on staging first** with `scripts/env-check.cjs` and the unauthenticated probes (302 for pages, 401 for the API), the switcher, an inbox request and an MCP call on the new staging hostname.
4. **Production** only after the owner approves: repeat step 2 for production, install the PWA from the new host, move the ChatGPT connector to the new URL, and update the five assistant prompts if the database display name changes.
5. **Soak** for at least two weeks with both hostnames live. Then redirect the old hostnames (301) to the new ones, keeping the old `/api/v1` and `/mcp` paths answering until every connector is confirmed moved.
6. **Optional, last:** rename the Workers (new Worker, cut over, retire the old), the repository, the MCP server name and the database display name. Each is independent and none is needed for the rebrand to be complete.

## Rollback
Steps 2 to 5 are additive: removing the new hostnames restores the previous state exactly. Do not remove the old hostnames until step 5 has soaked.

## Costs and approvals
No paid resources are required (custom domains on an existing zone and Access applications within the current plan). Per the working rules, adding domains, Access applications or Workers is a Cloudflare provisioning change and needs the owner's explicit approval before it starts.

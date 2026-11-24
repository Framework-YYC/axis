import { ArrowLeftRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ENVIRONMENTS, envOfHost, otherEnv, switchUrl, type CurrentEnv } from "../../shared/environments";
import { cx } from "../lib/cx";

/** The environment this page is served from, and (for the two approved hosts only) where "switch" goes. Navigation only: nothing is sent along. */
export function useEnvironment() {
  const { pathname, search, hash } = useLocation();
  const env: CurrentEnv | null = envOfHost(location.hostname);
  const target = env === "production" || env === "staging" ? otherEnv(env) : null;
  const href = target ? switchUrl(target, { pathname, search, hash }) : null;
  return { env, target, href };
}

const NAME: Record<CurrentEnv, string> = { production: "Production", staging: "Staging", development: "Local development" };
const DOT: Record<CurrentEnv, string> = { production: "var(--lime)", staging: "var(--amber)", development: "var(--faint)" };

/** A status dot. The colour never travels alone: the name is always beside it. */
export function EnvDot({ env, size = 10 }: { env: CurrentEnv; size?: number }) {
  return <i aria-hidden className="block shrink-0 rounded-full" style={{ width: size, height: size, background: DOT[env], boxShadow: env === "development" ? "none" : `0 0 0 3px color-mix(in srgb, ${DOT[env]} 28%, transparent)` }} />;
}

/** Shown beside the Axis branding when viewing staging, so it is never mistaken for production. */
export function StagingTag({ className }: { className?: string }) {
  const { env } = useEnvironment();
  if (env !== "staging") return null;
  return <span className={cx("inline-flex h-[18px] items-center gap-1 rounded-[6px] px-1.5 font-mono text-[9px] font-medium tracking-[0.08em]", className)} style={{ color: "var(--amber)", background: "color-mix(in srgb, var(--amber) 16%, transparent)" }}><EnvDot env="staging" size={5} />STAGING</span>;
}

/** The Environment section: current environment with a status dot, and a switch to the other approved one. */
export function EnvCard({ compact }: { compact?: boolean }) {
  const { env, target, href } = useEnvironment();
  if (!env) return null;
  return (
    <section aria-label="Environment">
      <p className="mono mb-1.5 px-1">Environment</p>
      <div className={cx("flat", compact ? "p-3" : "p-4")}>
        <div className="flex items-center gap-3">
          <EnvDot env={env} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium leading-tight">{NAME[env]}</p>
            <p className="mt-0.5 truncate text-[12px] text-muted">{env === "development" ? location.host : ENVIRONMENTS[env].host}</p>
          </div>
        </div>
        {href && target && (
          <a href={href} rel="noopener noreferrer" referrerPolicy="no-referrer" className="btn btn-soft mt-3 w-full" aria-label={`Switch to ${ENVIRONMENTS[target].label}. Opens the same page there; you may be asked to sign in.`}>
            <ArrowLeftRight size={15} aria-hidden />Switch to {ENVIRONMENTS[target].label}
          </a>
        )}
        <p className="mt-2.5 text-[11.5px] leading-snug text-faint">{href ? "Separate data and sign-in. Nothing is copied or shared between environments." : "Only the production and staging hosts can be switched."}</p>
      </div>
    </section>
  );
}

/** iPad: the rail has no room for the card, so a dot button opens it beside the rail. */
export function EnvRailButton() {
  const { env } = useEnvironment();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); removeEventListener("keydown", esc); };
  }, [open]);
  if (!env) return null;
  return (
    <div ref={ref} className="relative xl:hidden">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" aria-label={`Environment: ${NAME[env]}. Open switcher.`} title={`Environment: ${NAME[env]}`} className="grid h-12 w-full place-items-center gap-0.5 rounded-[18px] bg-[var(--rail)] text-white shadow-[0_14px_24px_-12px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.12)]">
        <EnvDot env={env} size={9} />
        <span className="font-mono text-[8.5px] tracking-[0.1em] text-[var(--rail-ink)]">{env === "production" ? "PROD" : env === "staging" ? "STAGE" : "DEV"}</span>
      </button>
      {open && <div role="dialog" aria-label="Environment" className="panel rise absolute bottom-0 left-[68px] z-40 w-[260px] p-2.5"><EnvCard compact /></div>}
    </div>
  );
}

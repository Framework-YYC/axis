import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ModuleId } from "../../shared/modules";
import { cx } from "../lib/cx";
import { moreTabs, primaryTabs, TAB_LABEL, type TabId } from "./nav";

/** Contextual tabs under a module heading: the module's main screens, plus a More menu for the rest. */
export function ModuleTabs({ module, tab, counts }: { module: ModuleId; tab: TabId; counts?: Partial<Record<TabId, number>> }) {
  const [, setSp] = useSearchParams();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const primary = primaryTabs(module), more = moreTabs(module);
  const go = (t: TabId) => { setSp((p) => { const n = new URLSearchParams(p); n.set("tab", t); n.delete("h"); return n; }, { replace: true }); setMenu(false); };
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", off); addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); removeEventListener("keydown", esc); };
  }, [menu]);
  const inMore = more.includes(tab);
  const base = "hit inline-flex items-center gap-1.5 rounded-full px-3 text-[12.5px] whitespace-nowrap transition-colors";
  return (
    <div ref={ref} className="relative mb-4 flex items-center gap-1.5">
      <div role="tablist" aria-label="Sections" className="no-scrollbar flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-full p-0.5" style={{ boxShadow: "0 0 0 1px var(--line)" }}>
        {primary.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => go(t)} className={cx(base, tab === t ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : "text-muted hover:text-[var(--ink)]")}>
            {TAB_LABEL[t]}{counts?.[t] ? <span className="num hidden text-[11px] opacity-70 min-[430px]:inline">{counts[t]}</span> : null}
          </button>
        ))}
      </div>
      <button onClick={() => setMenu((o) => !o)} aria-haspopup="menu" aria-expanded={menu} aria-label="More sections" className={cx(base, "shrink-0", inMore ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : "text-muted")} style={inMore ? undefined : { boxShadow: "0 0 0 1px var(--line)" }}>
        {inMore ? TAB_LABEL[tab] : "More"}<ChevronDown size={14} strokeWidth={1.5} aria-hidden />
      </button>
      {menu && (
        <ul role="menu" className="panel rise absolute right-0 top-[calc(100%+6px)] z-30 w-48 p-1.5">
          {more.map((t) => <li key={t} role="none"><button role="menuitem" onClick={() => go(t)} className={cx("hit flex w-full items-center rounded-xl px-3 text-left text-[14px]", tab === t ? "bg-[var(--card-dim)]" : "hover:bg-[var(--card-dim)]")}>{TAB_LABEL[t]}</button></li>)}
        </ul>
      )}
    </div>
  );
}

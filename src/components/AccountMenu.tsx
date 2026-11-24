import { Check, ChevronRight, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { useTheme, type ThemeMode } from "../lib/theme";
import { EnvCard } from "./EnvSwitch";
import { Modal } from "./forms";

const THEMES: Array<{ id: ThemeMode; label: string; icon: typeof Sun }> = [{ id: "system", label: "System", icon: Monitor }, { id: "light", label: "Light", icon: Sun }, { id: "dark", label: "Dark", icon: Moon }];

/** The compact header control that replaces the old More tab: account, settings shortcuts, appearance and the environment switcher. */
export function AccountMenuButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { me, approvals } = useData();
  const { mode, setMode } = useTheme();
  const initials = me.signedIn ? me.label.slice(0, 2).toUpperCase() : "··";
  const links: Array<[string, string, number?]> = [["/settings", "All settings"], ["/settings#approvals", "Approvals", approvals.length], ["/settings#connections", "Assistant connections"], ["/settings#activity", "Activity and audit"], ["/calendar", "Calendar"], ["/goals#habits", "Goals and habits"]];
  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Settings and account" className={cx("hit relative grid place-items-center text-muted hover:text-[var(--ink)]", className)}>
        <Settings size={18} strokeWidth={1.4} aria-hidden />
        {approvals.length > 0 && <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full" style={{ background: "var(--w-terra)" }} />}
      </button>
      {open && (
        <Modal title="Settings" onClose={() => setOpen(false)}>
          <div className="flex items-center gap-3 pb-3">
            <span className="grid size-10 place-items-center rounded-full bg-[var(--card-dim)] text-[12px] font-medium">{initials}</span>
            <div className="min-w-0"><p className="truncate text-[14px] font-medium">{me.label}</p><p className="text-[12px] text-muted">{me.signedIn ? "Signed in" : "Checking sign-in…"}</p></div>
          </div>
          <ul className="mb-4">
            {links.map(([to, label, n]) => (
              <li key={to}><Link to={to} onClick={() => setOpen(false)} className="hit flex items-center justify-between border-t border-line text-[14px]"><span>{label}</span><span className="flex items-center gap-2 text-faint">{n ? <span className="num text-[12px]" style={{ color: "var(--w-terra)" }}>{n}</span> : null}<ChevronRight size={15} strokeWidth={1.5} aria-hidden /></span></Link></li>
            ))}
          </ul>
          <p className="mono mb-1.5 px-1">Appearance</p>
          <div role="group" aria-label="Appearance" className="mb-5 grid grid-cols-3 gap-1 rounded-full p-0.5" style={{ boxShadow: "0 0 0 1px var(--line)" }}>
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id} className={cx("hit flex items-center justify-center gap-1.5 rounded-full text-[13px]", mode === id ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : "text-muted")}>{mode === id ? <Check size={13} aria-hidden /> : <Icon size={14} strokeWidth={1.5} aria-hidden />}{label}</button>
            ))}
          </div>
          <EnvCard />
        </Modal>
      )}
    </>
  );
}

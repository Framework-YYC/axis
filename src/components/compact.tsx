import { Check, ChevronRight, Flame, Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { MODULE_IDS, MODULES_META, type ModuleId } from "../../shared/modules";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { pretty } from "../lib/dates";
import type { Goal, Habit } from "../lib/types";
import { Modal } from "./forms";
import { ModuleIcon, ProvenanceMark, Ring, SyntheticMark } from "./mobile";
import { GoalCard, HabitRow, scheduleText } from "./records";
import { isUnverified } from "./ui";

const TERM_ORDER = { short: 0, medium: 1, long: 2 } as const;
const TERM_TEXT = { short: "Short", medium: "Medium", long: "Long" } as const;
const clean = (t: string) => t.replace(/ \(synthetic\)$/, "");

function GoalTile({ g, onOpen }: { g: Goal; onOpen: (g: Goal) => void }) {
  const pct = Math.round(g.progress);
  return (
    <li className="border-b border-line last:border-b-0 @[640px]:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
      <button onClick={() => onOpen(g)} className="hit press flex w-full items-center gap-3 py-2.5 text-left" aria-label={`${g.title}, ${pct} percent. Open details`}>
        <Ring value={g.progress} size={44} stroke={4.5} label={`${pct} percent`}><span className="num text-[11px] font-medium">{pct}</span></Ring>
        <span className="min-w-0 flex-1">
          <span className="break-words text-[14.5px] leading-snug [overflow-wrap:anywhere] line-clamp-2">{clean(g.title)}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted">
            {g.term && <span className="shrink-0">{TERM_TEXT[g.term]}</span>}
            {g.targetDate && <span className="truncate">· {pretty(g.targetDate, { day: "numeric", month: "short", year: "2-digit" })}</span>}
            {g.kind === "numeric" && g.targetValue !== null && <span className="hidden truncate @[480px]:inline">· {g.currentValue ?? "–"} / {g.targetValue}{g.unit ? ` ${g.unit}` : ""}</span>}
            {g.status !== "active" && <span className="shrink-0">· {g.status}</span>}
            {isUnverified(g.source) && <ProvenanceMark />}{g.demo && <SyntheticMark />}
          </span>
        </span>
        <span className="num hidden shrink-0 text-[13px] text-muted @[420px]:block">{pct}%</span>
        <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-faint" aria-hidden />
      </button>
    </li>
  );
}

/**
 * Goals as compact horizontal rows (progress ring, title, term and target, chevron), grouped by module and ordered short to long.
 * The layout follows the width of the content area, not the screen: one column when narrow, two when there is room.
 * Progress logging, milestones and editing open in the detail sheet.
 */
export function GoalList({ goals, onEdit, grouped = true }: { goals: Goal[]; onEdit: (g: Goal) => void; grouped?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const live = open ? goals.find((g) => g.id === open) : undefined;
  const sort = (a: Goal, b: Goal) => (a.term ? TERM_ORDER[a.term] : 3) - (b.term ? TERM_ORDER[b.term] : 3) || (a.targetDate ?? "9").localeCompare(b.targetDate ?? "9");
  const groups = MODULE_IDS.map((m) => ({ m, items: goals.filter((g) => g.module === m).sort(sort) })).filter((x) => x.items.length);
  return (
    <div className="@container">
      {(grouped ? groups : [{ m: null as ModuleId | null, items: [...goals].sort(sort) }]).map(({ m, items }) => (
        <section key={m ?? "all"} className="mb-3 last:mb-0">
          {m && <h3 className="mb-0.5 flex items-center gap-2 px-1 text-[13px] font-medium"><ModuleIcon id={m} size={22} />{MODULES_META[m].label}<span className="mono ml-1">{items.length}</span></h3>}
          <ul className="flat grid grid-cols-1 gap-x-8 px-3.5 py-0.5 @[640px]:grid-cols-2">{items.map((g) => <GoalTile key={g.id} g={g} onOpen={(x) => setOpen(x.id)} />)}</ul>
        </section>
      ))}
      {live && (
        <Modal title={clean(live.title)} onClose={() => setOpen(null)}>
          <ul><GoalCard g={live} showModule onEdit={(g) => { setOpen(null); onEdit(g); }} /></ul>
        </Modal>
      )}
    </div>
  );
}

function HabitTile({ h, onOpen }: { h: Habit; onOpen: (h: Habit) => void }) {
  const { logHabit } = useData();
  const quant = h.targetValue !== null;
  const t = h.today;
  const week = h.recent.slice(-7);
  return (
    <li className="flex items-center gap-1 py-1">
      <button onClick={() => void logHabit(h.id)} disabled={!t.applies || (!quant && t.done)} aria-label={!t.applies ? `${h.title}: rest day` : quant ? `Log one for ${h.title}` : t.done ? `${h.title} done today` : `Mark ${h.title} done today`} className="hit grid shrink-0 place-items-center">
        <span className={cx("grid size-10 place-items-center rounded-full transition-colors", t.done ? "bg-[var(--g-sage)] text-[var(--w-on)]" : t.applies ? "inset text-muted" : "inset text-faint opacity-50")}>
          {quant && !t.done ? <Plus size={17} aria-hidden /> : <Check size={17} strokeWidth={2.6} aria-hidden />}
        </span>
      </button>
      <button onClick={() => onOpen(h)} className="hit min-w-0 flex-1 py-1 text-left" aria-label={`${h.title}. Open details`}>
        <span className="break-words text-[14.5px] leading-snug [overflow-wrap:anywhere] line-clamp-2">{clean(h.title)}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
          <ModuleIcon id={h.module} size={16} />
          <span className="truncate">{t.applies ? (quant ? `${t.value.toLocaleString()} / ${t.target.toLocaleString()}${h.unit ? ` ${h.unit}` : ""}` : scheduleText(h).replace(/ per .*/, "")) : "Rest day"}</span>
          {h.rotationMode !== "any" && <Repeat size={11} aria-label="Follows work rotation" className="shrink-0" />}
          {isUnverified(h.source) && <ProvenanceMark />}{h.demo && <SyntheticMark />}
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5 pr-1">
        <span className="flex items-center gap-0.5 text-[12px] font-medium num" aria-label={`${h.streak.current} day streak`}><Flame size={13} className={h.streak.current ? "text-[var(--amber)]" : "text-faint"} aria-hidden />{h.streak.current}</span>
        <span className="flex gap-[3px] @max-[330px]:hidden" role="img" aria-label="Last 7 days">
          {week.map((d, i) => <i key={i} className="block size-[9px] rounded-full" style={{ background: d.done ? "var(--g-sage)" : "transparent", boxShadow: d.done ? "none" : d.applies ? "inset 0 0 0 1.5px var(--tick-off)" : "none", opacity: d.applies ? 1 : 0.35 }} />)}
        </span>
      </div>
    </li>
  );
}

/** Habits: a one-tap tracker with streak and seven-day history. One column when narrow, two when the content area has room. Details open in a sheet. */
export function HabitList({ habits, onEdit }: { habits: Habit[]; onEdit: (h: Habit) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const live = open ? habits.find((h) => h.id === open) : undefined;
  const due = habits.filter((h) => h.today.applies), rest = habits.filter((h) => !h.today.applies);
  const list = (items: Habit[]) => <ul className="flat grid grid-cols-1 gap-x-8 px-2 py-1 @[700px]:grid-cols-2">{items.map((h) => <HabitTile key={h.id} h={h} onOpen={(x) => setOpen(x.id)} />)}</ul>;
  return (
    <div className="@container">
      {due.length > 0 && list(due)}
      {rest.length > 0 && (<><p className="mono mb-1 mt-3 px-1">Rest today</p>{list(rest)}</>)}
      {live && (
        <Modal title={clean(live.title)} onClose={() => setOpen(null)}>
          <ul><HabitRow h={live} showModule onEdit={(h) => { setOpen(null); onEdit(h); }} /></ul>
        </Modal>
      )}
    </div>
  );
}

export { HabitTile };

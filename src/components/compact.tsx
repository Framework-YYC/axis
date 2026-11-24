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
  return (
    <li>
      <button onClick={() => onOpen(g)} className="hit flex w-full items-center gap-3 py-2 text-left" aria-label={`${g.title}, ${Math.round(g.progress)} percent. Open details`}>
        <Ring value={g.progress} size={46} stroke={5} label={`${Math.round(g.progress)} percent`}><span className="num text-[11.5px] font-medium">{Math.round(g.progress)}</span></Ring>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[14.5px] leading-snug [overflow-wrap:anywhere] line-clamp-2">{clean(g.title)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            {g.term && <span>{TERM_TEXT[g.term]}</span>}
            {g.targetDate && <span>· {pretty(g.targetDate, { day: "numeric", month: "short", year: "2-digit" })}</span>}
            {g.status !== "active" && <span>· {g.status}</span>}
            {isUnverified(g.source) && <ProvenanceMark />}{g.demo && <SyntheticMark />}
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
      </button>
    </li>
  );
}

/** Goals: compact rows grouped by module and ordered by time horizon on phones; the full cards on wider screens. Details open in a bottom sheet. */
export function GoalList({ goals, onEdit, grouped = true }: { goals: Goal[]; onEdit: (g: Goal) => void; grouped?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const live = open ? goals.find((g) => g.id === open) : undefined;
  const sort = (a: Goal, b: Goal) => (a.term ? TERM_ORDER[a.term] : 3) - (b.term ? TERM_ORDER[b.term] : 3) || (a.targetDate ?? "9").localeCompare(b.targetDate ?? "9");
  const groups = MODULE_IDS.map((m) => ({ m, items: goals.filter((g) => g.module === m).sort(sort) })).filter((x) => x.items.length);
  return (
    <>
      <div className="md:hidden">
        {(grouped ? groups : [{ m: null as ModuleId | null, items: [...goals].sort(sort) }]).map(({ m, items }) => (
          <section key={m ?? "all"} className="mb-3 last:mb-0">
            {m && <h3 className="mb-0.5 flex items-center gap-2 px-1 text-[13px] font-medium"><ModuleIcon id={m} size={22} />{MODULES_META[m].label}<span className="mono ml-1">{items.length}</span></h3>}
            <ul className="flat px-3 py-1">{items.map((g) => <GoalTile key={g.id} g={g} onOpen={(x) => setOpen(x.id)} />)}</ul>
          </section>
        ))}
      </div>
      <ul className="hidden gap-3 md:grid lg:grid-cols-2">{goals.map((g) => <GoalCard key={g.id} g={g} onEdit={onEdit} />)}</ul>
      {live && (
        <Modal title={clean(live.title)} onClose={() => setOpen(null)}>
          <ul><GoalCard g={live} showModule onEdit={(g) => { setOpen(null); onEdit(g); }} /></ul>
        </Modal>
      )}
    </>
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
        <span className="block break-words text-[14.5px] leading-snug [overflow-wrap:anywhere] line-clamp-2">{clean(h.title)}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
          <ModuleIcon id={h.module} size={16} />
          <span className="truncate">{t.applies ? (quant ? `${t.value.toLocaleString()} / ${t.target.toLocaleString()}${h.unit ? ` ${h.unit}` : ""}` : scheduleText(h).replace(/ per .*/, "")) : "Rest day"}</span>
          {h.rotationMode !== "any" && <Repeat size={11} aria-label="Follows work rotation" className="shrink-0" />}
          {isUnverified(h.source) && <ProvenanceMark />}{h.demo && <SyntheticMark />}
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5 pr-1">
        <span className="flex items-center gap-0.5 text-[12px] font-medium num" aria-label={`${h.streak.current} day streak`}><Flame size={13} className={h.streak.current ? "text-[var(--amber)]" : "text-faint"} aria-hidden />{h.streak.current}</span>
        <span className="flex gap-[3px]" role="img" aria-label="Last 7 days">
          {week.map((d, i) => <i key={i} className="block size-[9px] rounded-full" style={{ background: d.done ? "var(--g-sage)" : "transparent", boxShadow: d.done ? "none" : d.applies ? "inset 0 0 0 1.5px var(--tick-off)" : "none", opacity: d.applies ? 1 : 0.35 }} />)}
        </span>
      </div>
    </li>
  );
}

/** Habits: a one-tap tracker with streaks and a seven-day history on phones; the full rows on wider screens. */
export function HabitList({ habits, onEdit }: { habits: Habit[]; onEdit: (h: Habit) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const live = open ? habits.find((h) => h.id === open) : undefined;
  const due = habits.filter((h) => h.today.applies), rest = habits.filter((h) => !h.today.applies);
  return (
    <>
      <div className="md:hidden">
        {due.length > 0 && <ul className="flat px-2 py-1">{due.map((h) => <HabitTile key={h.id} h={h} onOpen={(x) => setOpen(x.id)} />)}</ul>}
        {rest.length > 0 && (
          <>
            <p className="mono mb-1 mt-3 px-1">Rest today</p>
            <ul className="flat px-2 py-1">{rest.map((h) => <HabitTile key={h.id} h={h} onOpen={(x) => setOpen(x.id)} />)}</ul>
          </>
        )}
      </div>
      <ul className="hidden md:block">{habits.map((h) => <HabitRow key={h.id} h={h} onEdit={onEdit} />)}</ul>
      {live && (
        <Modal title={clean(live.title)} onClose={() => setOpen(null)}>
          <ul><HabitRow h={live} showModule onEdit={(h) => { setOpen(null); onEdit(h); }} /></ul>
        </Modal>
      )}
    </>
  );
}

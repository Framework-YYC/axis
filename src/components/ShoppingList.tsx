import { ArrowUpRight, Plus, RotateCcw, ShoppingBasket } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { orderItems, restorable } from "../../shared/shopping";
import { patch, post } from "../lib/api";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import type { ShoppingItem } from "../lib/types";
import { Field, FormError, Modal, TextInput } from "./forms";
import { Card } from "./InstrumentCard";
import { Btn } from "./ui";

/** All shopping-list actions. Every one goes through the service layer; a failed save is reported in words and nothing is assumed saved. */
function useShopping() {
  const { shopping, mutate } = useData();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { open, checked } = orderItems(shopping);
  const cleared = restorable(shopping.filter((i) => !i.procurementId), new Date().toISOString());
  const run = async (req: () => ReturnType<typeof post>, failure: string): Promise<boolean> => {
    setBusy(true); setError(null);
    const r = await mutate(req);
    setBusy(false);
    if (r && r.success) return true;
    setError(r && !r.success ? r.error.message : `${failure} Orbis could not be reached; nothing was saved.`);
    return false;
  };
  return {
    open, checked, cleared, error, busy, setError,
    add: (item: string, quantity: string, job: string) => run(() => post("/shopping", { item, ...(quantity.trim() ? { quantity: quantity.trim() } : {}), ...(job.trim() ? { job: job.trim() } : {}) }), "The item was not added."),
    toggle: (i: ShoppingItem) => run(() => patch(`/shopping/${i.id}`, { checked: i.status === "open", expectedVersion: i.version }), "The change was not saved."),
    edit: (i: ShoppingItem, f: { title: string; quantity: string; job: string; notes: string }) => run(() => patch(`/shopping/${i.id}`, { item: f.title, quantity: f.quantity.trim() || null, job: f.job.trim() || null, notes: f.notes.trim() || null, expectedVersion: i.version }), "The change was not saved."),
    clear: () => run(() => post("/shopping/clear"), "Checked items were not cleared."),
    restore: (i: ShoppingItem) => run(() => post(`/shopping/${i.id}/restore`), "The item was not restored."),
    promote: (i: ShoppingItem) => run(() => post(`/shopping/${i.id}/promote`), "The item was not sent to Procurement."),
  };
}

const CheckMark = ({ done, fresh }: { done: boolean; fresh: boolean }) => (
  <span className={cx("grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-200", done ? "bg-ink text-[var(--card-a)]" : "inset text-transparent", fresh && "check-in")}>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" className={fresh ? "check-draw" : undefined} /></svg>
  </span>
);

const detail = (i: ShoppingItem) => [i.quantity, i.job ? `Job ${i.job}` : null].filter(Boolean).join(" · ");

function ItemRow({ item, onToggle, onOpen, disabled }: { item: ShoppingItem; onToggle: () => void; onOpen?: () => void; disabled?: boolean }) {
  const done = item.status === "checked";
  const [fresh, setFresh] = useState(false);
  return (
    <li className="flex items-center border-t border-line first:border-t-0">
      <button onClick={() => { setFresh(true); onToggle(); }} disabled={disabled} aria-pressed={done} aria-label={`${done ? "Put back on the list" : "Mark collected"}: ${item.title}`} className="hit press -ml-1.5 grid shrink-0 place-items-center px-1.5"><CheckMark done={done} fresh={fresh} /></button>
      <button onClick={onOpen} disabled={!onOpen} className="hit min-w-0 flex-1 py-1.5 pl-1 text-left" aria-label={onOpen ? `Edit ${item.title}` : undefined}>
        <span className={cx("block break-words text-[14.5px] leading-snug [overflow-wrap:anywhere]", done && "text-muted line-through")}>{item.title}</span>
        {(detail(item) || done) && <span className="mono block !normal-case !tracking-normal">{done ? `Collected${detail(item) ? " · " : ""}` : ""}{detail(item)}</span>}
      </button>
    </li>
  );
}

function AddForm({ s, expanded }: { s: ReturnType<typeof useShopping>; expanded: boolean }) {
  const [title, setTitle] = useState(""); const [qty, setQty] = useState(""); const [job, setJob] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (await s.add(title.trim(), qty, job)) { setTitle(""); setQty(""); setJob(""); input.current?.focus(); }
  };
  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex gap-2">
        <input ref={input} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Add an item" placeholder="Add an item" maxLength={200} enterKeyHint="done" className="inset h-11 min-w-0 flex-1 rounded-full bg-transparent px-4 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-ink/30" />
        <button type="submit" disabled={s.busy || !title.trim()} aria-label="Add item" className="btn btn-primary press !min-h-11 !w-11 !px-0"><Plus size={18} strokeWidth={1.7} aria-hidden /></button>
      </div>
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TextInput id="shop-qty" value={qty} onChange={setQty} placeholder="Quantity (optional)" aria-label="Quantity, optional" maxLength={40} />
          <TextInput id="shop-job" value={job} onChange={setJob} placeholder="Job no. (optional)" aria-label="Job number, optional" maxLength={40} inputMode="numeric" />
        </div>
      )}
    </form>
  );
}

function EditSheet({ item, s, onClose }: { item: ShoppingItem; s: ReturnType<typeof useShopping>; onClose: () => void }) {
  const [f, setF] = useState({ title: item.title, quantity: item.quantity ?? "", job: item.job ?? "", notes: item.notes ?? "" });
  const save = async () => { if (f.title.trim() && (await s.edit(item, { ...f, title: f.title.trim() }))) onClose(); };
  return (
    <Modal title="Edit item" onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={s.busy}>{s.busy ? "Saving…" : "Save"}</Btn></>}>
      <FormError message={s.error} />
      <div className="space-y-4">
        <Field label="Item">{(id) => <TextInput id={id} value={f.title} onChange={(v) => setF({ ...f, title: v })} maxLength={200} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" hint="Optional">{(id) => <TextInput id={id} value={f.quantity} onChange={(v) => setF({ ...f, quantity: v })} maxLength={40} />}</Field>
          <Field label="Job number" hint="Optional">{(id) => <TextInput id={id} value={f.job} onChange={(v) => setF({ ...f, job: v })} maxLength={40} inputMode="numeric" />}</Field>
        </div>
        <Field label="Note">{(id) => <TextInput id={id} value={f.notes} onChange={(v) => setF({ ...f, notes: v })} maxLength={1000} />}</Field>
      </div>
    </Modal>
  );
}

/** The full list: add with quantity and job, tick off, restore, clear checked, restore cleared, send to Procurement. */
export function ShoppingSheet({ onClose }: { onClose: () => void }) {
  const s = useShopping();
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [sending, setSending] = useState<ShoppingItem | null>(null);
  const [showCleared, setShowCleared] = useState(false);
  return (
    <>
      <Modal title="Shopping list" onClose={onClose}>
        <FormError message={editing || sending ? null : s.error} />
        <AddForm s={s} expanded />
        <p className="mono mt-4 px-1">To buy · {s.open.length}</p>
        {s.open.length === 0 ? <p className="py-4 text-[13.5px] text-muted">Nothing on the list. Add what you need from town.</p> : (
          <ul className="flat mt-1 px-3 py-0.5">{s.open.map((i) => (
            <li key={i.id} className="flex items-center gap-1 border-t border-line first:border-t-0">
              <ul className="min-w-0 flex-1"><ItemRow item={i} onToggle={() => void s.toggle(i)} onOpen={() => { s.setError(null); setEditing(i); }} disabled={s.busy} /></ul>
              <button onClick={() => { s.setError(null); setSending(i); }} aria-label={`Send ${i.title} to Procurement`} title="Send to Procurement" className="hit press grid shrink-0 place-items-center text-muted"><ArrowUpRight size={16} strokeWidth={1.5} aria-hidden /></button>
            </li>
          ))}</ul>
        )}
        {s.checked.length > 0 && (
          <>
            <div className="mt-4 flex items-center justify-between gap-2 px-1"><p className="mono">Collected · {s.checked.length}</p><Btn variant="soft" onClick={() => void s.clear()} disabled={s.busy}>Clear checked</Btn></div>
            <ul className="flat mt-1 px-3 py-0.5">{s.checked.map((i) => (
              <li key={i.id} className="flex items-center gap-1 border-t border-line first:border-t-0">
                <ul className="min-w-0 flex-1"><ItemRow item={i} onToggle={() => void s.toggle(i)} disabled={s.busy} /></ul>
                <button onClick={() => void s.toggle(i)} disabled={s.busy} aria-label={`Restore ${i.title} to the list`} title="Restore to the list" className="hit press grid shrink-0 place-items-center text-muted"><RotateCcw size={15} strokeWidth={1.5} aria-hidden /></button>
              </li>
            ))}</ul>
          </>
        )}
        {s.cleared.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowCleared((o) => !o)} aria-expanded={showCleared} className="mono hit px-1 text-left">Cleared in the last 7 days · {s.cleared.length} {showCleared ? "(hide)" : "(show)"}</button>
            {showCleared && <ul className="flat mt-1 px-3 py-0.5">{s.cleared.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 border-t border-line py-1 first:border-t-0"><span className="min-w-0 truncate text-[14px] text-muted">{i.title}{detail(i) ? ` · ${detail(i)}` : ""}</span><Btn variant="soft" icon={RotateCcw} onClick={() => void s.restore(i)} disabled={s.busy}>Restore</Btn></li>
            ))}</ul>}
          </div>
        )}
      </Modal>
      {editing && <EditSheet item={editing} s={s} onClose={() => setEditing(null)} />}
      {sending && (
        <Modal title="Send to Procurement?" onClose={() => setSending(null)} footer={<><Btn variant="ghost" onClick={() => setSending(null)}>Cancel</Btn><Btn variant="primary" disabled={s.busy} onClick={async () => { if (await s.promote(sending)) setSending(null); }}>{s.busy ? "Sending…" : "Send to Procurement"}</Btn></>}>
          <FormError message={s.error} />
          <p className="text-[14px]">“{sending.title}”{detail(sending) ? ` (${detail(sending)})` : ""} becomes a request in Procurement, where it is tracked from request to receipt. It comes off this list.</p>
        </Modal>
      )}
    </>
  );
}

/** Work Overview card: how many items to buy, a one-field quick add, the first few items to tick off, and the full list one tap away. */
export function ShoppingCard({ className }: { className?: string }) {
  const s = useShopping();
  const [sheet, setSheet] = useState(false);
  const shown = s.open.slice(0, 4);
  return (
    <>
      <Card tone="charcoal" label="Shopping list" aria={`Shopping list: ${s.open.length} to buy`} className={className}>
        <div className="mt-2 flex items-center gap-3">
          <ShoppingBasket size={22} strokeWidth={1.4} aria-hidden className="shrink-0 opacity-70" />
          <p className="num text-[28px] font-light leading-none tracking-tight">{s.open.length}<span className="ml-2 text-[13px] font-normal opacity-60">to buy{s.checked.length ? ` · ${s.checked.length} collected` : ""}</span></p>
        </div>
        <AddForm s={s} expanded={false} />
        {s.error && !sheet && <p role="alert" className="mt-2 text-[12.5px] text-red">{s.error}</p>}
        <ul className="mt-2">
          {shown.map((i) => <ItemRow key={i.id} item={i} onToggle={() => void s.toggle(i)} disabled={s.busy} />)}
          {shown.length === 0 && <li className="py-2 text-[13.5px] text-muted">Nothing on the list.</li>}
        </ul>
        <button onClick={() => { s.setError(null); setSheet(true); }} className="btn btn-soft press mt-auto self-start !min-h-11 md:!min-h-10">{s.open.length > shown.length ? `Open list (${s.open.length - shown.length} more)` : "Open list"}</button>
      </Card>
      {sheet && <ShoppingSheet onClose={() => setSheet(false)} />}
    </>
  );
}

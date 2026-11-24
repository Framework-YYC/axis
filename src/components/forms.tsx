import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "../lib/motion";
import { cx } from "../lib/cx";
import { Btn } from "./ui";

/** A sheet on iPhone, a centred panel on larger screens. Esc, the backdrop and the close button animate it away; it never blocks interaction while opening. */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const close = useRef(() => {});
  close.current = () => { if (closing) return; if (prefersReducedMotion()) { onClose(); return; } setClosing(true); setTimeout(onClose, 220); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    return () => removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button className={cx("absolute inset-0 bg-black/45", closing ? "scrim-out" : "scrim-in")} aria-label="Close" onClick={() => close.current()} tabIndex={-1} />
      <div ref={ref} className={cx("glass-sheet relative flex max-h-[92dvh] w-full flex-col rounded-b-none rounded-t-[28px] md:rounded-[24px]", closing ? "sheet-out" : "sheet-in", wide ? "md:max-w-3xl" : "md:max-w-xl")}>
        <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="text-[18px] font-medium tracking-tight">{title}</h2>
          <button onClick={() => close.current()} aria-label="Close" className="inset press grid size-11 place-items-center rounded-full md:size-9"><X size={16} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <footer className="safe-b flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: (id: string) => ReactNode; hint?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={id} className="mono mb-1.5 block">{label}</label>
      {children(id)}
      {hint && <p className="mono mt-1 !normal-case !tracking-normal">{hint}</p>}
    </div>
  );
}

const FIELD = "inset h-11 w-full rounded-[12px] bg-transparent px-3.5 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-ink/30";
export function TextInput({ id, value, onChange, ...rest }: { id: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return <input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} {...rest} />;
}
export function TextArea({ id, value, onChange, rows = 3 }: { id: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea id={id} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className={cx(FIELD, "h-auto resize-y py-2.5")} />;
}
export function Select<T extends string>({ id, value, onChange, options }: { id: string; value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }> }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={cx(FIELD, "appearance-none bg-[length:12px] pr-8")}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function Chips<T extends number | string>({ value, onChange, options, label }: { value: T[]; onChange: (v: T[]) => void; options: ReadonlyArray<{ value: T; label: string }>; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return <button key={String(o.value)} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])} className={cx("h-9 min-w-9 rounded-full px-3 text-[12.5px] font-medium", on ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : "inset text-muted")}>{o.label}</button>;
      })}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="panel-dim mb-3 p-3 text-[13px] text-red">{message}</p> : null;
}

export function ModalActions({ onClose, onSave, saving, saveLabel = "Save", left }: { onClose: () => void; onSave: () => void; saving?: boolean; saveLabel?: string; left?: ReactNode }) {
  return (
    <>
      <div className="flex gap-2">{left}</div>
      <div className="flex gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={onSave} disabled={saving} kbd="↵">{saving ? "Saving…" : saveLabel}</Btn>
      </div>
    </>
  );
}

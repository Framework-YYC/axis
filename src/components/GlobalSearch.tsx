import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchHits } from "../../shared/search";
import { useData } from "../lib/data";
import { Modal } from "./forms";

/** One search across tasks, goals, habits, calendar and the finance records already loaded. Nothing is sent anywhere. */
export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { tasks, goals, habits, events, finance } = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchHits(q, { tasks, goals, habits, events, txns: finance?.transactions ?? [], bills: finance?.bills ?? [], accounts: finance?.accounts ?? [] }), [q, tasks, goals, habits, events, finance]);
  const groups = [...new Set(hits.map((h) => h.group))];
  const go = (to: string) => { onClose(); navigate(to); };
  return (
    <Modal title="Search" onClose={onClose}>
      <div className="inset flex h-11 items-center gap-2 rounded-[14px] px-3.5">
        <Search size={15} strokeWidth={1.5} className="shrink-0 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Orbis" placeholder="Tasks, goals, habits, events, bills…" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" />
      </div>
      <div className="mt-3 min-h-[120px]" aria-live="polite">
        {q.trim().length < 2 ? <p className="mono py-6 text-center !normal-case">Type at least two letters.</p> : hits.length === 0 ? <p className="mono py-6 text-center !normal-case">Nothing matches “{q.trim()}”.</p> : groups.map((g) => (
          <section key={g} className="mb-3 last:mb-0">
            <p className="mono mb-1 px-1">{g}</p>
            <ul>{hits.filter((h) => h.group === g).map((h) => (
              <li key={h.key} className="border-t border-line first:border-t-0"><button onClick={() => go(h.to)} className="hit flex w-full items-center justify-between gap-3 text-left text-[14px]"><span className="min-w-0 truncate">{h.title}</span>{h.sub && <span className="mono shrink-0 !normal-case">{h.sub}</span>}</button></li>
            ))}</ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}

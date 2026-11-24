import { Check, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Btn, DemoTag, Empty, PageHeader, Row, Status, Tag, Widget } from "../components/ui";
import { api, ApiUnavailable } from "../lib/api";
import { useData } from "../lib/data";
import { ageLabel } from "../lib/useNow";
import { demoActivity, demoIntegrations } from "../data/synthetic";

interface Integration { id: string; name: string; scopes: string[]; lastUsedAt: string | null; revokedAt: string | null }
interface ActivityEvent { at: string; actor: string; channel: string; action: string; outcome?: string }

const hhmm = (at: string) => (at.includes("T") ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : at);

export default function Intelligence() {
  const { approvals, decide, source } = useData();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const demo = source === "demo";

  const load = useCallback(async () => {
    if (demo) { setIntegrations(demoIntegrations); setActivity(demoActivity); return; }
    try {
      const [i, a] = await Promise.all([api<{ integrations: Integration[] }>("/integrations"), api<{ events: ActivityEvent[] }>("/activity?limit=25")]);
      if (i.success) setIntegrations(i.data.integrations);
      if (a.success) setActivity(a.data.events);
    } catch (e) { if (!(e instanceof ApiUnavailable)) throw e; }
  }, [demo]);
  useEffect(() => { void load(); }, [load, approvals.length, key]);

  const revoke = async (id: string) => {
    setConfirm(null);
    if (!demo) await api(`/integrations/${id}/revoke`, { method: "POST" });
    else setIntegrations((cur) => cur.map((x) => (x.id === id ? { ...x, revokedAt: new Date().toISOString() } : x)));
    setKey((k) => k + 1);
  };

  return (
    <>
      <PageHeader crumb="INTELLIGENCE" title="Intelligence" subtitle="Everything an assistant sends is reviewed by you first" tag={demo ? <DemoTag text="Local preview · synthetic data" /> : <Tag>Live from Axis</Tag>} />
      <div className="stagger grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-12">
        <Widget id="approvals" title="Awaiting your approval" count={approvals.length} className="lg:col-span-7">
          {approvals.length === 0 ? <Empty>Nothing waiting. Bulk and destructive requests from an assistant land here.</Empty> : (
            <ul className="space-y-2.5">
              {approvals.map((a) => (
                <li key={a.id} className="panel-dim flex flex-wrap items-center gap-3 p-3.5">
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2"><span className="tag">APR</span><span className="mono">{ageLabel(a.createdAt)}</span></div>
                    <p className="mt-1.5 text-[14px] font-medium">{a.summary}</p>
                    <p className="mono mt-0.5 !normal-case">Requested by {a.requestedBy} · {a.channel}</p>
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="primary" icon={Check} onClick={() => void decide(a.id, true)} className="!min-h-9 !px-4 !text-[12.5px]">Approve</Btn>
                    <Btn variant="soft" icon={X} onClick={() => void decide(a.id, false)} className="!min-h-9 !px-4 !text-[12.5px]">Decline</Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget id="assistants" title="Connected assistants" className="lg:col-span-5">
          {integrations.length === 0 ? <Empty>No assistants connected yet.</Empty> : (
            <ul>
              {integrations.map((i) => (
                <Row key={i.id} left={i.name} sub={`${i.scopes.join(" · ")}${i.lastUsedAt ? ` · used ${ageLabel(i.lastUsedAt)} ago` : " · never used"}`}
                  right={i.revokedAt ? <Status tone="bad">Revoked</Status> : confirm === i.id ? <span className="flex gap-1.5"><Btn variant="primary" onClick={() => void revoke(i.id)} className="!min-h-8 !px-3 !text-[12px]">Confirm</Btn><Btn variant="ghost" onClick={() => setConfirm(null)} className="!min-h-8 !px-2 !text-[12px]">Cancel</Btn></span> : <span className="flex items-center gap-2"><Status tone="ok">Connected</Status><Btn variant="soft" onClick={() => setConfirm(i.id)} className="!min-h-8 !px-3 !text-[12px]">Revoke</Btn></span>} />
              ))}
            </ul>
          )}
          <p className="mono mt-3 !normal-case">Revoking takes effect on the assistant's very next request.</p>
        </Widget>

        <Widget id="activity" title="Recent activity" tag="Audit trail" className="lg:col-span-12">
          {activity.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ul>
              {activity.map((e, i) => (
                <li key={i} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0 first:pt-0 text-[13px]">
                  <span className="mono num w-12 shrink-0">{hhmm(e.at)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.actor}</span>
                  <span className="tag hidden sm:inline-flex">{e.channel}</span>
                  <span className="mono max-w-[40%] truncate !normal-case !tracking-normal">{e.action}{e.outcome && e.outcome !== "success" ? ` · ${e.outcome}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mono mt-3 !normal-case">The trail records who or which assistant did what, when and through which channel. It never stores record content.</p>
        </Widget>
      </div>
    </>
  );
}

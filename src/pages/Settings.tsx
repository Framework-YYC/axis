import { Check, X } from "lucide-react";
import { useState } from "react";
import { MODULE_IDS, MODULES_META, type ModuleId } from "../../shared/modules";
import { assistantLabel } from "../../shared/modules";
import { Field, Select, TextInput } from "../components/forms";
import { EnvCard } from "../components/EnvSwitch";
import { Btn, Empty, PageHeader, Status, Widget } from "../components/ui";
import { post } from "../lib/api";
import { useData } from "../lib/data";
import { useTheme, type ThemeMode } from "../lib/theme";
import { useApi } from "../lib/useApi";

const ZONES = ["America/Edmonton", "America/Vancouver", "America/Toronto", "America/Winnipeg", "America/Halifax", "UTC"];
interface Integration { id: string; name: string; kind: string; scopes: string[]; modules: string[] | null; createdAt: string; revokedAt: string | null; lastUsedAt: string | null }

export default function Settings({ who, environment, signedIn }: { who: string; environment: string; signedIn: boolean }) {
  const { settings, approvals, inbox, activity, decide, mutate, tasks, goals, habits, events, today } = useData();
  const { mode, setMode } = useTheme();
  const [msg, setMsg] = useState<string | null>(null);
  const [rot, setRot] = useState({ anchorDate: settings.work_rotation.anchorDate, onDays: String(settings.work_rotation.onDays), offDays: String(settings.work_rotation.offDays) });
  const [conn, setConn] = useState<{ name: string; module: ModuleId; access: "read" | "write"; days: string }>({ name: "", module: "daily", access: "write", days: "30" });
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [rev, setRev] = useState(0);
  const integrations = useApi<{ integrations: Integration[] }>("/integrations", `${inbox.length}-${rev}`);
  const production = environment === "production";
  const demo = tasks.filter((t) => t.demo).length + goals.filter((g) => g.demo).length + habits.filter((h) => h.demo).length + events.filter((e) => e.demo).length;
  const save = (key: string, value: unknown) => void mutate(() => post("/settings", { key, value }));
  const zones = ZONES.includes(settings.timezone) || settings.timezone === "auto" ? ZONES : [settings.timezone, ...ZONES];
  const saveRotation = async () => {
    const onDays = Number(rot.onDays), offDays = Number(rot.offDays);
    const r = await mutate(() => post("/settings", { key: "work_rotation", value: { anchorDate: rot.anchorDate, onDays, offDays } }));
    setMsg(r && r.success ? "Rotation saved." : r && !r.success ? r.error.message : "Could not save.");
  };
  const READ = ["tasks:read", "goals:read", "habits:read", "calendar:read", "briefing:read", "activity:read"];
  const WRITE = ["tasks:write", "goals:write", "habits:write", "calendar:write"];
  const createConn = async () => {
    const name = conn.name.trim() || `${MODULES_META[conn.module].label} assistant`;
    const r = await post<{ token: string }>("/integrations", { name, kind: "chatgpt", modules: [conn.module], scopes: conn.access === "write" ? [...READ, ...WRITE] : READ, expiresInDays: Number(conn.days) || 30 });
    if (r.success) { setFresh({ name, token: r.data.token }); setRev((n) => n + 1); setMsg(null); } else setMsg(r.error.message);
  };
  const revoke = async (id: string) => { const r = await post(`/integrations/${id}/revoke`, {}); setMsg(r.success ? "Connection revoked. Its token stops working immediately." : r.error.message); setRev((n) => n + 1); };
  const [work, setWork] = useState<Array<{ title: string; outcome: string; dueDate: string | null; existingTitle?: string }> | null>(null);
  const setupWork = async (dryRun: boolean) => {
    const r = await mutate(() => post<{ items: NonNullable<typeof work>; created: number }>("/work/recurring/setup", { today, dryRun }));
    if (r && r.success) { setWork(r.data.items); setMsg(dryRun ? "Preview only: nothing was changed." : `${r.data.created} recurring responsibilities added to Work.`); } else setMsg(r && !r.success ? r.error.message : "Could not reach Orbis.");
  };
  const demoAction = async (path: "load" | "clear") => {
    const r = await mutate(() => post(`/demo/${path}`, { today }));
    setMsg(r && r.success ? (path === "load" ? "Synthetic demonstration data loaded." : "Synthetic demonstration data removed.") : r && !r.success ? r.error.message : "Could not reach Orbis.");
  };

  return (
    <div className="@container">
      <PageHeader crumb="SETTINGS" title="Settings" subtitle={signedIn ? `${who} · ${environment}` : "Not signed in"} />
      {msg && <p role="status" className="panel-dim mb-3 p-3 text-[13px]">{msg}</p>}
      <div className="grid gap-3 @[1000px]:grid-cols-2">
        <div id="environment" className="@[1000px]:col-span-2"><EnvCard /></div>

        <Widget id="preferences" title="Preferences">
          <div className="grid gap-3.5 md:grid-cols-2">
            <Field label="Time zone" hint="Decides what 'today' means for horizons, habits and briefings.">{(id) => <Select id={id} value={settings.timezone === "auto" ? Intl.DateTimeFormat().resolvedOptions().timeZone : settings.timezone} onChange={(v) => save("timezone", v)} options={zones.filter((z) => z !== "auto").map((z) => ({ value: z, label: z.replace("_", " ") }))} />}</Field>
            <Field label="Week starts on">{(id) => <Select id={id} value={settings.week_start} onChange={(v) => save("week_start", v)} options={[{ value: "monday", label: "Monday" }, { value: "sunday", label: "Sunday" }]} />}</Field>
            <Field label="Units">{(id) => <Select id={id} value={settings.unit_system} onChange={(v) => save("unit_system", v)} options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]} />}</Field>
            <Field label="Currency">{(id) => <Select id={id} value={settings.currency} onChange={(v) => save("currency", v)} options={["CAD", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }))} />}</Field>
            <Field label="Appearance">{(id) => <Select id={id} value={mode} onChange={(v) => setMode(v as ThemeMode)} options={[{ value: "system", label: "Match device" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />}</Field>
          </div>
        </Widget>

        <Widget id="rotation" title="Work rotation" tag="Drives rotation-aware habits">
          <div className="grid gap-3.5 md:grid-cols-3">
            <Field label="Rotation start">{(id) => <TextInput id={id} type="date" value={rot.anchorDate} onChange={(v) => setRot((s) => ({ ...s, anchorDate: v }))} />}</Field>
            <Field label="Days on">{(id) => <TextInput id={id} inputMode="numeric" value={rot.onDays} onChange={(v) => setRot((s) => ({ ...s, onDays: v }))} />}</Field>
            <Field label="Days off">{(id) => <TextInput id={id} inputMode="numeric" value={rot.offDays} onChange={(v) => setRot((s) => ({ ...s, offDays: v }))} />}</Field>
          </div>
          <div className="mt-3"><Btn variant="primary" onClick={() => void saveRotation()}>Save rotation</Btn></div>
        </Widget>

        <Widget id="approvals" title="Approvals" count={approvals.length}>
          {approvals.length === 0 ? <Empty>Nothing waiting for you.</Empty> : (
            <ul>{approvals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex-1"><p className="text-[13.5px]">{a.summary}</p><p className="mono mt-0.5 !normal-case !tracking-normal">Requested by {a.requestedBy} · {a.createdAt.slice(0, 16).replace("T", " ")}</p></div>
                <Btn variant="primary" icon={Check} onClick={() => void decide(a.id, true)}>Approve</Btn>
                <Btn variant="soft" icon={X} onClick={() => void decide(a.id, false)}>Decline</Btn>
              </li>
            ))}</ul>
          )}
        </Widget>

        <Widget id="assistants" title="Assistants" tag="Five modules, one shared database">
          <ul>
            {(Object.keys(MODULES_META) as Array<keyof typeof MODULES_META>).map((m) => {
              const mine = inbox.filter((r) => r.assistant === m);
              return (
                <li key={m} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[13.5px] first:border-t-0 first:pt-0">
                  <span>{assistantLabel(m)}</span>
                  <span className="mono">{mine.length ? `${mine.length} recent request${mine.length > 1 ? "s" : ""} · last ${mine[0].createdAt.slice(5, 16).replace("T", " ")}` : "No requests yet"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mono mt-3 !normal-case !tracking-normal">Modules and the connections below are separate: a connection never sees another module.</p>
        </Widget>

        <Widget id="connections" title="Connections" tag="One token per assistant, limited to one module">
          <p className="text-[13.5px] text-muted">A connection is a revocable token that can only touch the module you choose, with only the access you give it. The assistant's identity comes from the token, never from what it says about itself. The token is shown once; only its hash is kept.</p>
          <div className="mt-3 grid gap-3.5 md:grid-cols-2">
            <Field label="Name">{(id) => <TextInput id={id} value={conn.name} onChange={(v) => setConn((c) => ({ ...c, name: v }))} placeholder="Optional" maxLength={60} />}</Field>
            <Field label="Module">{(id) => <Select id={id} value={conn.module} onChange={(v) => setConn((c) => ({ ...c, module: v }))} options={MODULE_IDS.map((m) => ({ value: m, label: MODULES_META[m].label }))} />}</Field>
            <Field label="Access">{(id) => <Select id={id} value={conn.access} onChange={(v) => setConn((c) => ({ ...c, access: v }))} options={[{ value: "write", label: "Read and write tasks, goals, habits, events" }, { value: "read", label: "Read only" }]} />}</Field>
            <Field label="Expires after (days)">{(id) => <TextInput id={id} inputMode="numeric" value={conn.days} onChange={(v) => setConn((c) => ({ ...c, days: v }))} />}</Field>
          </div>
          <div className="mt-3"><Btn variant="primary" onClick={() => void createConn()}>Create connection</Btn></div>
          {fresh && (
            <div role="status" className="panel-dim mt-3 p-3.5">
              <p className="text-[13px] font-medium">Token for {fresh.name}. Copy it now; it will not be shown again.</p>
              <p className="mono mt-2 break-all !normal-case !tracking-normal select-all">{fresh.token}</p>
              <div className="mt-2"><Btn variant="soft" onClick={() => setFresh(null)}>I have stored it</Btn></div>
            </div>
          )}
          {integrations.data && integrations.data.integrations.length > 0 && (
            <ul className="mt-3">{integrations.data.integrations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0">
                <span className="min-w-0 truncate">{i.name} <span className="text-muted">· {i.modules ? i.modules.join(", ") : "all modules"} · {i.scopes.some((x) => x.endsWith(":write")) ? "read and write" : "read only"}{i.lastUsedAt ? ` · used ${i.lastUsedAt.slice(0, 10)}` : ""}</span></span>
                {i.revokedAt ? <Status tone="idle">Revoked</Status> : <Btn variant="soft" onClick={() => void revoke(i.id)}>Revoke</Btn>}
              </li>
            ))}</ul>
          )}
        </Widget>

        <Widget id="activity" title="Assistant requests and audit" tag="Newest first" className="@[1000px]:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mono mb-2">Inbox</p>
              {inbox.length === 0 ? <Empty>No requests yet.</Empty> : <ul>{inbox.slice(0, 12).map((r) => <li key={r.id} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0"><span className="min-w-0 truncate">{MODULES_META[r.assistant]?.label} · {r.op}{r.result?.message ? <span className="text-muted"> · {r.result.message}</span> : null}</span><Status tone={r.status === "applied" ? "ok" : r.status === "duplicate" ? "idle" : r.status === "approval_required" ? "lime" : "bad"}>{r.status.replace("_", " ")}</Status></li>)}</ul>}
            </div>
            <div>
              <p className="mono mb-2">Audit trail</p>
              {activity.length === 0 ? <Empty>No activity.</Empty> : <ul>{activity.slice(0, 12).map((a, i) => <li key={i} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0"><span className="min-w-0 truncate">{a.action} <span className="text-muted">· {a.actor}</span></span><span className="mono shrink-0">{a.at.slice(5, 16).replace("T", " ")}</span></li>)}</ul>}
            </div>
          </div>
        </Widget>

        {!production && <Widget id="data" title="Demonstration data" tag={demo ? `${demo} synthetic records` : "None loaded"}>
          <p className="text-[13.5px] text-muted">Orbis starts empty. You can load a small, clearly labelled synthetic set (every title ends "(synthetic)") to see the screens populated, and remove it again at any time. It never touches records you or an assistant create.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="soft" onClick={() => void demoAction("load")} disabled={demo > 0}>Load demonstration data</Btn>
            <Btn variant="soft" onClick={() => void demoAction("clear")} disabled={demo === 0}>Remove demonstration data</Btn>
          </div>
        </Widget>}

        <Widget id="work" title="Work recurring tasks" tag="Rotation-aware">
          <p className="text-[13.5px] text-muted">Adds the Work module's standing responsibilities (daily headcount, EHS minutes, safety observations, toolbox talks, Progress Meeting minutes and the weekly and monthly KPIs). Anything that already exists is recognised and left alone, so running it again changes nothing. Whether each one follows your work rotation is set on the task.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="soft" onClick={() => void setupWork(true)}>Preview</Btn>
            <Btn variant="primary" onClick={() => void setupWork(false)}>Set up Work recurring tasks</Btn>
          </div>
          {work && <ul className="mt-3 text-[13px]">{work.map((w) => <li key={w.title} className="flex justify-between gap-3 border-t border-line py-1.5 first:border-t-0"><span className="min-w-0 truncate">{w.title}</span><span className="mono shrink-0 !normal-case">{w.outcome === "exists" ? `exists: ${w.existingTitle}` : `${w.outcome === "created" ? "added" : "would add"}${w.dueDate ? ` · next ${w.dueDate}` : ""}`}</span></li>)}</ul>}
        </Widget>

        <Widget id="security" title="Security">
          <ul className="space-y-2 text-[13.5px]">
            <li className="flex justify-between gap-3"><span>Sign-in</span><span className="mono">Cloudflare Access, owner only</span></li>
            <li className="flex justify-between gap-3"><span>Writes from assistants</span><span className="mono">Validated, audited, module-confined</span></li>
            <li className="flex justify-between gap-3"><span>Bulk and destructive changes</span><span className="mono">Need your approval</span></li>
            <li className="flex justify-between gap-3"><span>Imported and assistant text</span><span className="mono">Treated as untrusted</span></li>
          </ul>
        </Widget>
      </div>
    </div>
  );
}

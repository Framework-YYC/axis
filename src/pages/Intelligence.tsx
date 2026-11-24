import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { Badge, Button, DemoBadge, PageHeader, Row, Widget } from "../components/ui";

export default function Intelligence() {
  return (
    <>
      <PageHeader title="Intelligence" subtitle="Everything an assistant sends is reviewed by you first" actions={<DemoBadge />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Awaiting your approval" icon={ShieldCheck} action={<Badge tone="warn">2 pending</Badge>}>
          <ul>
            <Row left="Create 14 tasks from weekly review" sub="Requested by ChatGPT: Personal assistant · bulk" right={<span className="flex gap-1"><Button icon={Check} label="Approve" /><Button icon={X} variant="ghost" label="Reject" /></span>} />
            <Row left="Archive “Sort receipts”" sub="Requested by ChatGPT: Personal assistant · destructive" right={<span className="flex gap-1"><Button icon={Check} label="Approve" /><Button icon={X} variant="ghost" label="Reject" /></span>} />
          </ul>
          <p className="mt-3 text-xs text-muted">The approvals API is live (<code>/api/v1/approvals</code>); this screen will be wired to it in the next phase.</p>
        </Widget>
        <Widget title="Connected assistants" icon={Bot}>
          <ul>
            <Row left="ChatGPT: Personal assistant" sub="Read and write tasks · last used 3 min ago" right={<Badge tone="good">Connected</Badge>} />
            <Row left="Apple Shortcut: Log water" sub="Write health data · not yet created" right={<Badge>Planned</Badge>} />
          </ul>
        </Widget>
        <Widget title="Recent activity" className="lg:col-span-2">
          <ul>
            <Row left="ChatGPT created “Renew passport”" sub="MCP · task.create" right="09:02" />
            <Row left="Owner completed “Renew passport”" sub="Web · task.complete" right="09:41" />
            <Row left="ChatGPT read the daily summary" sub="MCP · read:get_daily_summary" right="09:42" />
          </ul>
          <p className="mt-3 text-xs text-muted">Illustrative rows. The real audit trail is recorded for every change and assistant read.</p>
        </Widget>
      </div>
    </>
  );
}

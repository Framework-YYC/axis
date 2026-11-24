import { useState } from "react";
import { SegBar } from "../components/charts";
import { PageHeader, Row, Segmented, Status, Tag, Widget } from "../components/ui";
import { localToday } from "../lib/dates";
import { useTheme, type ThemeMode } from "../lib/theme";
import { DEFAULT_ROTATION } from "../../shared/rotation";
import { rotationTicks } from "../../shared/viz";

export default function Settings({ who, environment, signedIn }: { who: string; environment: string; signedIn: boolean }) {
  const { mode, setMode } = useTheme();
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  return (
    <>
      <PageHeader crumb="SETTINGS" title="Settings" subtitle="Appearance is saved on this device. The rest arrives with the settings API." />
      <div className="stagger grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-2">
        <Widget id="appearance" title="Appearance">
          <Segmented<ThemeMode> label="Appearance" value={mode} onChange={setMode} options={[{ value: "system", label: "Automatic" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          <p className="mono mt-3 !normal-case">Automatic follows this device and changes with it.</p>
        </Widget>
        <Widget id="units" title="Units & currency" tag="Preview">
          <Segmented label="Unit system" value={units} onChange={setUnits} options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]} />
          <ul className="mt-4"><Row left="Currency" right="CAD" /><Row left="Time zone" right="This device (automatic)" /></ul>
        </Widget>
        <Widget id="rotation" title="Work rotation" tag="Preview">
          <SegBar ticks={rotationTicks(localToday(), DEFAULT_ROTATION)} label="Current rotation cycle" height={22} />
          <ul className="mt-4"><Row left="Pattern" right={`${DEFAULT_ROTATION.onDays} on / ${DEFAULT_ROTATION.offDays} off`} /><Row left="Current block started" right={DEFAULT_ROTATION.anchorDate} /></ul>
        </Widget>
        <Widget id="security" title="Account security">
          <ul>
            <Row left="Signed in as" right={signedIn ? who : "Not signed in"} />
            <Row left="Environment" right={<Tag>{environment || "…"}</Tag>} />
            <Row left="Sign-in" sub="Cloudflare Access, checked again by the Worker" right={signedIn ? <Status tone="ok">Enforced</Status> : <Status tone="idle">Local preview</Status>} />
          </ul>
        </Widget>
        <Widget id="data" title="Data, backup and integrations" className="lg:col-span-2">
          <p className="max-w-3xl text-[13.5px] text-muted">Export, deletion, backup and recovery procedures are documented in docs/SECURITY.md. Integration tokens and OAuth connections are managed in Intelligence. Categories and notification preferences arrive in the next phase.</p>
        </Widget>
      </div>
    </>
  );
}

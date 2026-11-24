import { Lock, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Badge, Card, PageHeader, Row, Segmented, Widget } from "../components/ui";
import { useTheme, type ThemeMode } from "../lib/theme";
import { DEFAULT_ROTATION } from "../../shared/rotation";

export default function Settings({ who, environment }: { who: string; environment: string }) {
  const { mode, setMode } = useTheme();
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  return (
    <>
      <PageHeader title="Settings" subtitle="Preferences are local to this preview until the settings API ships" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Appearance">
          <Segmented<ThemeMode> label="Appearance" value={mode} onChange={setMode} options={[{ value: "system", label: "Automatic" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          <p className="mt-2 flex items-center gap-3 text-xs text-muted"><Monitor size={14} aria-hidden />Automatic follows the device <Sun size={14} aria-hidden /> <Moon size={14} aria-hidden /></p>
        </Widget>
        <Widget title="Units & currency">
          <Segmented label="Unit system" value={units} onChange={setUnits} options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]} />
          <ul className="mt-3"><Row left="Currency" right="CAD" /><Row left="Timezone" right="Device (automatic)" /></ul>
        </Widget>
        <Widget title="Work rotation"><ul><Row left="Pattern" right={`${DEFAULT_ROTATION.onDays} on / ${DEFAULT_ROTATION.offDays} off`} /><Row left="Current block started" right={DEFAULT_ROTATION.anchorDate} /></ul></Widget>
        <Widget title="Account security" icon={Lock}>
          <ul>
            <Row left="Signed in as" right={who} />
            <Row left="Environment" right={<Badge tone={environment === "production" ? "warn" : "accent"}>{environment}</Badge>} />
            <Row left="Sign-in" sub="Cloudflare Access, validated again by the Worker" right={<Badge tone="good">Enforced</Badge>} />
          </ul>
        </Widget>
        <Card className="p-5 lg:col-span-2"><h2 className="mb-1 text-sm font-semibold">Data, backup and integrations</h2><p className="text-sm text-muted">Export, deletion, backup and recovery procedures are documented in docs/SECURITY.md. Integration tokens and OAuth connections, categories and notification preferences arrive in the next phase.</p></Card>
      </div>
    </>
  );
}

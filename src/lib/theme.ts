import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "axis-theme";
const ORDER: ThemeMode[] = ["system", "light", "dark"];

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const resolve = (m: ThemeMode) => (m === "system" ? (systemDark() ? "dark" : "light") : m);

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(read);

  useEffect(() => {
    const apply = () => document.documentElement.setAttribute("data-theme", resolve(mode));
    apply();
    if (mode !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode]);

  const choose = useCallback((m: ThemeMode) => {
    setMode(m);
    try {
      if (m === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch { /* storage may be blocked; the choice then lasts for this visit only */ }
  }, []);
  const cycle = useCallback(() => choose(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]), [choose, mode]);
  return { mode, setMode: choose, cycle };
}

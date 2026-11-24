import { useCallback, useState } from "react";

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

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(read);
  const apply = useCallback((m: ThemeMode) => {
    setMode(m);
    try {
      if (m === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch { /* storage may be blocked; the choice then lasts for this visit only */ }
    if (m === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", m);
  }, []);
  const cycle = useCallback(() => apply(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]), [apply, mode]);
  return { mode, setMode: apply, cycle };
}

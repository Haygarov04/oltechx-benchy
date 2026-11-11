import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useLang } from "./i18n";

/** Light, dark or the same as the system. The choice is remembered on this computer. */
export type Theme = "system" | "light" | "dark";

export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem("theme");
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Storage may be unavailable; follow the system.
  }
  return "system";
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme === "dark" || (theme === "system" && systemDark()) ? "dark" : "light";
}

export function ThemeSwitch() {
  const { t } = useLang();
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // Not remembered, still applied for now.
    }
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [theme]);
  const options = [
    { value: "system", label: t("themeSystem"), Icon: MonitorIcon },
    { value: "light", label: t("themeLight"), Icon: SunIcon },
    { value: "dark", label: t("themeDark"), Icon: MoonIcon },
  ] as const;
  return (
    <div className="segmented" role="group" aria-label={t("theme")}>
      {options.map(({ value, label, Icon }) => (
        <button key={value} type="button" aria-pressed={theme === value} title={label} aria-label={label} onClick={() => setTheme(value)}>
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

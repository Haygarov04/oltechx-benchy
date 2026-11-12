import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLang } from "./i18n";

/**
 * Light, dark or the same as the device. The default follows the device. The choice is kept on this
 * computer and, when the app is connected, in the OLTechX account, so it is the same on the site
 * and on every device.
 */
export type Theme = "system" | "light" | "dark";

export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem("theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    // Storage may be unavailable; follow the device.
  }
  return "system";
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme === "dark" || (theme === "system" && systemDark()) ? "dark" : "light";
}

// ── One shared choice for the whole app ──
let current: Theme = savedTheme();
const listeners = new Set<() => void>();

/** Sets the theme. `fromAccount` means it came from the account, so it is not sent back. */
export function setThemeChoice(theme: Theme, fromAccount = false) {
  current = theme;
  applyTheme(theme);
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // Not remembered on this computer, still applied for now.
  }
  listeners.forEach((listener) => listener());
  if (!fromAccount) void window.olx?.saveTheme?.(theme).catch(() => undefined);
}

// "Like the device" follows the computer when its mode changes.
if (typeof window !== "undefined") window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => current === "system" && applyTheme("system"));

const useTheme = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );

/** One button that shows the current theme; a click opens the three choices. */
export function ThemeSwitch() {
  const { t } = useLang();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const options = [
    { value: "system", label: t("themeSystem"), Icon: MonitorIcon },
    { value: "light", label: t("themeLight"), Icon: SunIcon },
    { value: "dark", label: t("themeDark"), Icon: MoonIcon },
  ] as const;
  const dark = document.documentElement.dataset.theme === "dark";
  const Shown = theme === "system" ? MonitorIcon : dark ? MoonIcon : SunIcon;
  return (
    <div ref={box} className="theme-menu">
      <button type="button" className="icon-button" aria-label={t("theme")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Shown aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="menu">
          {options.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              className="menu-item"
              onClick={() => {
                setThemeChoice(value);
                setOpen(false);
              }}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {theme === value && <CheckIcon aria-hidden="true" className="menu-check" />}
            </button>
          ))}
          <p className="menu-note">{t("themeNote")}</p>
        </div>
      )}
    </div>
  );
}

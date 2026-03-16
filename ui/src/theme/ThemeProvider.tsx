import React, { useEffect, useMemo, useState } from "react";
import { theme as antdTheme } from "antd";
import type { ThemeConfig } from "antd";

import { ThemeContext } from "@/theme/ThemeContext.ts";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";
export type ThemePresetId = "teal" | "blue" | "emerald" | "orange" | "rose";

export type ThemePreset = {
  id: ThemePresetId;
  name: string;
  primaryHex: string;
  primaryRgb: string;
  primaryLightRgb: string;
  primaryDarkRgb: string;
};

type ThemeSettings = {
  mode: ThemeMode;
  presetId: ThemePresetId;
};

export type ThemeContextValue = {
  themeSettings: ThemeSettings;
  resolvedMode: ResolvedThemeMode;
  presets: readonly ThemePreset[];
  currentPreset: ThemePreset;
  setMode: (mode: ThemeMode) => void;
  setPreset: (presetId: ThemePresetId) => void;
  resetTheme: () => void;
  antdThemeConfig: ThemeConfig;
};

const THEME_STORAGE_KEY = "ts_swagger_theme_v1";

const THEME_PRESETS = [
  {
    id: "teal",
    name: "青玉",
    primaryHex: "#0f766e",
    primaryRgb: "15 118 110",
    primaryLightRgb: "95 196 182",
    primaryDarkRgb: "12 74 73",
  },
  {
    id: "blue",
    name: "海蓝",
    primaryHex: "#2563eb",
    primaryRgb: "37 99 235",
    primaryLightRgb: "147 197 253",
    primaryDarkRgb: "29 78 216",
  },
  {
    id: "emerald",
    name: "翠绿",
    primaryHex: "#059669",
    primaryRgb: "5 150 105",
    primaryLightRgb: "110 231 183",
    primaryDarkRgb: "4 120 87",
  },
  {
    id: "orange",
    name: "橙金",
    primaryHex: "#ea580c",
    primaryRgb: "234 88 12",
    primaryLightRgb: "253 186 116",
    primaryDarkRgb: "194 65 12",
  },
  {
    id: "rose",
    name: "玫红",
    primaryHex: "#e11d48",
    primaryRgb: "225 29 72",
    primaryLightRgb: "251 113 133",
    primaryDarkRgb: "159 18 57",
  },
] as const satisfies readonly ThemePreset[];

const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: "system",
  presetId: "teal",
};

const isBrowser = typeof window !== "undefined";

const getSystemPreferredMode = (): ResolvedThemeMode => {
  if (!isBrowser) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";

const isThemePresetId = (value: unknown): value is ThemePresetId =>
  THEME_PRESETS.some((preset) => preset.id === value);

const loadThemeSettings = (): ThemeSettings => {
  if (!isBrowser) return DEFAULT_THEME_SETTINGS;

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    const mode = isThemeMode(parsed.mode) ? parsed.mode : DEFAULT_THEME_SETTINGS.mode;
    const presetId = isThemePresetId(parsed.presetId)
      ? parsed.presetId
      : DEFAULT_THEME_SETTINGS.presetId;

    return {
      mode,
      presetId,
    };
  } catch {
    return DEFAULT_THEME_SETTINGS;
  }
};

const applyDocumentTheme = (resolvedMode: ResolvedThemeMode, preset: ThemePreset) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute("data-theme", resolvedMode);
  root.style.setProperty("--primary", preset.primaryRgb);
  root.style.setProperty("--primary-light", preset.primaryLightRgb);
  root.style.setProperty("--primary-dark", preset.primaryDarkRgb);
  root.style.colorScheme = resolvedMode;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => loadThemeSettings());
  const [systemMode, setSystemMode] = useState<ResolvedThemeMode>(() => getSystemPreferredMode());

  useEffect(() => {
    if (!isBrowser) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (event: MediaQueryListEvent) => {
      setSystemMode(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const currentPreset = useMemo(
    () => THEME_PRESETS.find((preset) => preset.id === themeSettings.presetId) ?? THEME_PRESETS[0],
    [themeSettings.presetId],
  );

  const resolvedMode: ResolvedThemeMode = themeSettings.mode === "system" ? systemMode : themeSettings.mode;

  useEffect(() => {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeSettings));
    } catch {
      // Ignore storage errors in private mode / quota full.
    }
  }, [themeSettings]);

  useEffect(() => {
    applyDocumentTheme(resolvedMode, currentPreset);
  }, [currentPreset, resolvedMode]);

  const antdThemeConfig = useMemo(
    () => ({
      algorithm: resolvedMode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: currentPreset.primaryHex,
        borderRadius: 10,
        fontFamily: "var(--ts-font-sans), sans-serif",
      },
    }),
    [currentPreset.primaryHex, resolvedMode],
  );

  const setMode = (mode: ThemeMode) => {
    setThemeSettings((prev) => (prev.mode === mode ? prev : { ...prev, mode }));
  };

  const setPreset = (presetId: ThemePresetId) => {
    setThemeSettings((prev) => (prev.presetId === presetId ? prev : { ...prev, presetId }));
  };

  const resetTheme = () => {
    setThemeSettings(DEFAULT_THEME_SETTINGS);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeSettings,
      resolvedMode,
      presets: THEME_PRESETS,
      currentPreset,
      setMode,
      setPreset,
      resetTheme,
      antdThemeConfig,
    }),
    [antdThemeConfig, currentPreset, resolvedMode, themeSettings],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

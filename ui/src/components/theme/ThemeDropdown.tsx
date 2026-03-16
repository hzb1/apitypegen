import React from "react";
import { BgColorsOutlined, ReloadOutlined } from "@ant-design/icons";
import { Popover, Radio, Tooltip } from "antd";

import { type ThemeMode } from "@/theme/ThemeProvider.tsx";
import { useTheme } from "@/theme/useTheme.ts";
import "./ThemeDropdown.css";

const MODE_OPTIONS: Array<{ label: string; value: ThemeMode }> = [
  { label: "浅色", value: "light" },
  { label: "暗色", value: "dark" },
  { label: "跟随系统", value: "system" },
];

const MODE_LABELS: Record<ThemeMode, string> = {
  light: "浅色",
  dark: "暗色",
  system: "跟随系统",
};

const RESOLVED_LABELS: Record<"light" | "dark", string> = {
  light: "浅色",
  dark: "暗色",
};

const ThemeDropdown: React.FC = () => {
  const {
    themeSettings,
    resolvedMode,
    presets,
    currentPreset,
    setMode,
    setPreset,
    resetTheme,
  } = useTheme();

  const content = (
    <div className="theme-dropdown-panel">
      <div className="theme-dropdown-title">主题设置</div>

      <div className="theme-dropdown-section">
        <div className="theme-dropdown-label">显示模式</div>
        <Radio.Group
          className="theme-mode-group"
          size="small"
          value={themeSettings.mode}
          onChange={(event) => setMode(event.target.value as ThemeMode)}
          optionType="button"
          buttonStyle="solid"
          options={MODE_OPTIONS}
        />
      </div>

      <div className="theme-dropdown-section">
        <div className="theme-dropdown-label">自定义主题</div>
        <div className="theme-preset-grid">
          {presets.map((preset) => {
            const active = preset.id === currentPreset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`theme-preset-item${active ? " is-active" : ""}`}
                onClick={() => setPreset(preset.id)}
                aria-pressed={active}
                title={`一键试用 ${preset.name}`}
              >
                <span
                  className="theme-preset-dot"
                  style={{ backgroundColor: preset.primaryHex }}
                  aria-hidden
                />
                <span className="theme-preset-name">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" className="theme-reset-button" onClick={resetTheme}>
        <ReloadOutlined />
        <span>恢复默认主题</span>
      </button>

      <div className="theme-dropdown-hint">
        当前：{MODE_LABELS[themeSettings.mode]}（实际 {RESOLVED_LABELS[resolvedMode]}） · {currentPreset.name}
      </div>
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={content}
      overlayClassName="theme-dropdown-popover"
    >
      <Tooltip title="主题设置">
        <button type="button" className="theme-trigger-button" aria-label="打开主题设置">
          <BgColorsOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
};

export default ThemeDropdown;

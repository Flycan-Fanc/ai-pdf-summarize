/**
 * 主题切换模块
 * 提供主题管理功能，包括系统主题检测、主题切换和本地存储
 */

import type { Ref } from "vue";

/**
 * 主题模式类型
 */
export type ThemeMode = "system" | "light" | "dark";

/**
 * 有效主题类型
 */
export type EffectiveTheme = "light" | "dark";

/**
 * 主题选项接口
 */
export interface ThemeOption {
  label: string;
  value: ThemeMode;
}

/**
 * 主题管理器类
 */
export class ThemeManager {
  /**
   * 主题模式响应式引用
   */
  themeMode: Ref<ThemeMode>;

  /**
   * 系统偏好深色模式响应式引用
   */
  prefersDark: Ref<boolean>;

  /**
   * 媒体查询监听器
   */
  mql: MediaQueryList | null = null;

  /**
   * 创建主题管理器
   * @param themeModeRef - 主题模式响应式引用
   * @param prefersDarkRef - 系统偏好深色模式响应式引用
   */
  constructor(themeModeRef: Ref<ThemeMode>, prefersDarkRef: Ref<boolean>) {
    this.themeMode = themeModeRef;
    this.prefersDark = prefersDarkRef;
  }

  /**
   * 初始化主题管理器
   */
  init(): void {
    // 从本地存储加载主题偏好
    const savedTheme = localStorage.getItem("themeMode") as ThemeMode | null;
    if (savedTheme && ["system", "light", "dark"].includes(savedTheme)) {
      this.themeMode.value = savedTheme;
    }

    // 监听系统主题变化
    this.setupSystemThemeListener();
  }

  /**
   * 设置系统主题监听器
   */
  setupSystemThemeListener(): void {
    this.mql = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

    const applySystemTheme = () => {
      this.prefersDark.value = !!this.mql?.matches;
    };

    applySystemTheme();

    // 添加事件监听器
    if (this.mql?.addEventListener) {
      this.mql.addEventListener("change", applySystemTheme);
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.mql?.removeEventListener) {
      this.mql.removeEventListener("change", () => {});
    }
  }

  /**
   * 切换主题模式
   * @param mode - 新的主题模式
   */
  setThemeMode(mode: ThemeMode): void {
    if (["system", "light", "dark"].includes(mode)) {
      this.themeMode.value = mode;
      localStorage.setItem("themeMode", mode);
    }
  }

  /**
   * 获取当前有效主题
   * @returns 当前有效主题
   */
  getEffectiveTheme(): EffectiveTheme {
    if (this.themeMode.value === "light") return "light";
    if (this.themeMode.value === "dark") return "dark";
    return this.prefersDark.value ? "dark" : "light";
  }

  /**
   * 获取所有可用的主题模式选项
   * @returns 主题选项数组
   */
  static getThemeOptions(): ThemeOption[] {
    return [
      { label: "跟随系统", value: "system" },
      { label: "明亮", value: "light" },
      { label: "黑夜", value: "dark" },
    ];
  }

  /**
   * 获取CSS变量定义
   * @param theme - 当前主题
   * @returns CSS变量对象
   */
  static getThemeVariables(theme: EffectiveTheme): Record<string, string> {
    const lightTheme = {
      "--bg": "#f6f7fb",
      "--panel": "#ffffff",
      "--text": "#1f2328",
      "--muted": "#6b7280",
      "--border": "rgba(0, 0, 0, 0.1)",
      "--shadow": "0 10px 26px rgba(0, 0, 0, 0.08)",
    };

    const darkTheme = {
      "--bg": "#0b0f17",
      "--panel": "#0f172a",
      "--text": "#e5e7eb",
      "--muted": "#9aa4b2",
      "--border": "rgba(255, 255, 255, 0.12)",
      "--shadow": "0 14px 34px rgba(0, 0, 0, 0.6)",
    };

    return theme === "dark" ? darkTheme : lightTheme;
  }
}

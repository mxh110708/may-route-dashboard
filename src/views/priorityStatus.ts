import type { DesktopPrioritySummary } from "../app/desktop";

export function compactPrioritySummary(view: DesktopPrioritySummary): DesktopPrioritySummary {
  return { settings: { group: view.settings.group }, running: view.running, directMode: view.directMode,
    active: view.active, preferred: view.preferred, monitoredSelected: view.monitoredSelected,
    needsReload: view.needsReload, selected: view.selected };
}

export function samePrioritySummary(a: DesktopPrioritySummary | null, b: DesktopPrioritySummary): boolean {
  return a !== null && a.settings.group === b.settings.group && a.running === b.running &&
    a.directMode === b.directMode && a.active === b.active && a.preferred === b.preferred &&
    a.monitoredSelected === b.monitoredSelected && a.needsReload === b.needsReload && a.selected === b.selected;
}

// Describe the running policy, never the editable (possibly unsaved) switch.
export function priorityStatus<T extends DesktopPrioritySummary>(view: T): { label: string; tone: "neutral" | "good" | "warning" } {
  if (!view.running) return { label: "代理未运行", tone: "neutral" };
  if (view.directMode) return { label: "直连模式 · 已暂停", tone: "neutral" };
  if (!view.active) return { label: "监测未启用", tone: "neutral" };
  if (!view.selected) return { label: "等待节点状态", tone: "neutral" };
  if (!view.monitoredSelected) return { label: "当前节点未受监测", tone: "warning" };
  if (view.preferred && view.selected !== view.preferred) return { label: "备用运行 · 等待切回", tone: "warning" };
  return { label: "自动监测中", tone: "good" };
}

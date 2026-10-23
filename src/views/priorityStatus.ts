import type { DesktopPrioritySummary } from "../app/desktop";

export function compactPrioritySummary(view: DesktopPrioritySummary): DesktopPrioritySummary {
  return { settings: { group: view.settings.group, ...(view.usageAware ? { enabled: view.settings.enabled } : {}) }, running: view.running, directMode: view.directMode,
    active: view.active, preferred: view.preferred, monitoredSelected: view.monitoredSelected,
    needsReload: view.needsReload, selected: view.selected,
    ...(view.initializing ? { initializing: true } : {}),
    ...(view.usageAware ? { usageAware: true, activityAvailable: view.activityAvailable, activeGroups: view.activeGroups } : {}) };
}

export function samePrioritySummary(a: DesktopPrioritySummary | null, b: DesktopPrioritySummary): boolean {
  return a !== null && a.settings.group === b.settings.group && a.running === b.running &&
    a.settings.enabled === b.settings.enabled && a.usageAware === b.usageAware && a.activityAvailable === b.activityAvailable && a.initializing === b.initializing &&
    JSON.stringify(a.activeGroups) === JSON.stringify(b.activeGroups) &&
    a.directMode === b.directMode && a.active === b.active && a.preferred === b.preferred &&
    a.monitoredSelected === b.monitoredSelected && a.needsReload === b.needsReload && a.selected === b.selected;
}

// Describe the running policy, never the editable (possibly unsaved) switch.
export function priorityStatus<T extends DesktopPrioritySummary>(view: T, initializingLabel = "正在初始化监测"): { label: string; tone: "neutral" | "good" | "warning" } {
  if (!view.running) return { label: "代理未运行", tone: "neutral" };
  if (view.directMode) return { label: "直连模式 · 已暂停", tone: "neutral" };
  if (view.initializing) return { label: initializingLabel, tone: "neutral" };
  if (view.usageAware && !view.active && view.settings.enabled) {
    if (view.needsReload) return { label: "需要重载一次", tone: "warning" };
    if (view.activityAvailable === false) return { label: "等待入口使用状态", tone: "neutral" };
    return { label: "等待入口流量", tone: "neutral" };
  }
  if (!view.active) return { label: "监测未启用", tone: "neutral" };
  if (view.activeGroups?.length) {
    if (view.activeGroups.some(group => !group.monitoredSelected)) return { label: "部分节点未受监测", tone: "warning" };
    if (view.activeGroups.some(group => group.preferred && group.selected !== group.preferred)) return { label: "备用运行 · 等待切回", tone: "warning" };
    return { label: `${view.activeGroups.length} 个入口监测中`, tone: "good" };
  }
  if (!view.selected) return { label: "等待节点状态", tone: "neutral" };
  if (!view.monitoredSelected) return { label: "当前节点未受监测", tone: "warning" };
  if (view.preferred && view.selected !== view.preferred) return { label: "备用运行 · 等待切回", tone: "warning" };
  return { label: "自动监测中", tone: "good" };
}

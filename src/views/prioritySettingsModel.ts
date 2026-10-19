import type { DesktopPrioritySettings } from "../app/desktop";

function groupOrders(settings: DesktopPrioritySettings): Record<string, string[]> {
  const orders = Object.fromEntries(Object.entries(settings.groupOrders ?? {}).map(([group, order]) => [group, [...order]]));
  if (settings.group && !Object.hasOwn(orders, settings.group) && settings.order.length) Object.defineProperty(orders, settings.group, { value: [...settings.order], enumerable: true, writable: true, configurable: true });
  return orders;
}
export function priorityDraftForGroup(settings: DesktopPrioritySettings, group: string): DesktopPrioritySettings {
  const orders = groupOrders(settings);
  return { ...settings, group, order: Object.hasOwn(orders, group) ? [...orders[group]] : [], groupOrders: orders };
}
export function changePriorityDraft(settings: DesktopPrioritySettings, patch: Partial<DesktopPrioritySettings>): DesktopPrioritySettings {
  const next = { ...settings, ...patch, groupOrders: groupOrders(settings) };
  if (patch.order) Object.defineProperty(next.groupOrders, next.group, { value: [...patch.order], enumerable: true, writable: true, configurable: true });
  return next;
}
export function priorityDraftChanged(draft: DesktopPrioritySettings, base: DesktopPrioritySettings): boolean {
  const comparable = (value: DesktopPrioritySettings) => {
    const { group: _group, order: _order, groupOrders: _orders, ...global } = value;
    const orders = groupOrders(value);
    return JSON.stringify([global, Object.keys(orders).sort().filter(group => orders[group].length).map(group => [group, orders[group]])]);
  };
  return comparable(draft) !== comparable(base);
}

export function movePriorityNode(order: string[], from: number, to: number): string[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= order.length || to >= order.length) return order;
  const next = [...order]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}
export function priorityDraftError(settings: DesktopPrioritySettings, custom: boolean, nodes: string[]): string | null {
  if (settings.enabled && !nodes.length) return "当前分组没有可参与切换的代理节点。";
  if (custom && !settings.order.length) return "自定义顺序至少需要一个节点。";
  if (settings.order.some(tag => !nodes.includes(tag))) return "部分节点已不在当前分组，请刷新或移除这些节点。";
  for (const key of ["failureRounds", "backupSuccessRounds", "recoverySuccessRounds"] as const) {
    if (!Number.isInteger(settings[key]) || settings[key] < 1 || settings[key] > 20) return "连续轮数必须为 1–20 的整数。";
  }
  for (const key of ["recoveryStableMs", "failbackCooldownMs", "probeTimeoutMs", "healthyIntervalMs", "failureIntervalMs"] as const) {
    const min = key === "probeTimeoutMs" ? 1000 : key.includes("Interval") ? 5000 : 10000;
    const max = key === "probeTimeoutMs" ? 60000 : key.includes("Interval") ? 600000 : 3600000;
    if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) return "高级参数超出允许范围，请检查输入框旁的范围说明。";
  }
  return null;
}

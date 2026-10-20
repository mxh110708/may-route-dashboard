import { describe, expect, it } from "vitest";
import type { DesktopPriorityState } from "../app/desktop";
import { compactPrioritySummary, priorityStatus, samePrioritySummary } from "./priorityStatus";

const view: DesktopPriorityState = {
  settings: { enabled: true, group: "Entry", order: [], failureRounds: 3, backupSuccessRounds: 2, recoverySuccessRounds: 3, recoveryStableMs: 120000, failbackCooldownMs: 60000, probeTimeoutMs: 8000, healthyIntervalMs: 30000, failureIntervalMs: 10000,
    groupLatencyCeilings:{} },
  revision: "1", profileId: "test", groups: [], path: "test.json", running: true,
  directMode: false, active: true, preferred: "main", monitoredSelected: true,
  needsReload: false, selected: "main", lastSwitch: null,
};

describe("priority running status", () => {
  it("drops editor-only lists and retains unchanged summary identity without hiding changes", () => {
    const compact = compactPrioritySummary(view);
    expect(Object.keys(compact.settings)).toEqual(["group"]);
    expect(compact).not.toHaveProperty("groups");
    expect(compact).not.toHaveProperty("path");
    expect(samePrioritySummary(compact, compactPrioritySummary(view))).toBe(true);
    expect(samePrioritySummary(null, compact)).toBe(false);
    for (const key of ["running", "directMode", "active", "monitoredSelected", "needsReload"] as const) {
      expect(samePrioritySummary(compact, { ...compact, [key]: !compact[key] })).toBe(false);
    }
    expect(samePrioritySummary(compact, { ...compact, selected: "other" })).toBe(false);
    expect(samePrioritySummary(compact, { ...compact, preferred: "other" })).toBe(false);
    expect(samePrioritySummary(compact, { ...compact, settings: { group: "other" } })).toBe(false);
  });
  it("describes manual preference without claiming it is unhealthy", () => {
    expect(priorityStatus({ ...view, selected: "manual", preferred: "manual" }).label).toBe("自动监测中");
  });
  it("distinguishes backup and unmonitored nodes", () => {
    expect(priorityStatus({ ...view, selected: "backup" }).label).toBe("备用运行 · 等待切回");
    expect(priorityStatus({ ...view, selected: "outside", monitoredSelected: false }).label).toBe("当前节点未受监测");
  });
  it("does not confuse saved settings with the running policy", () => {
    expect(priorityStatus({ ...view, settings: { ...view.settings, enabled: false }, needsReload: true }).label).toBe("自动监测中");
    expect(priorityStatus({ ...view, active: false, needsReload: true }).label).toBe("监测未启用");
  });
  it("never shows monitoring for a stopped proxy or direct mode", () => {
    expect(priorityStatus({ ...view, running: false }).label).toBe("代理未运行");
    expect(priorityStatus({ ...view, directMode: true }).label).toBe("直连模式 · 已暂停");
  });
  it("does not invent monitoring when the selection is unavailable", () => {
    expect(priorityStatus({ ...view, selected: null }).label).toBe("等待节点状态");
  });
  it("reports idle, unknown and multiple region monitoring without using the editor group", () => {
    const usage = { ...view, usageAware: true, activeGroups: [], activityAvailable: true, active: false };
    expect(priorityStatus(usage).label).toBe("等待入口流量");
    expect(priorityStatus({ ...usage, activityAvailable: false }).label).toBe("等待入口使用状态");
    expect(priorityStatus({ ...usage, needsReload: true }).label).toBe("需要重载一次");
    const activeGroups = ["West", "HK"].map(group => ({ group, selected: "main", preferred: "main", monitoredSelected: true }));
    expect(priorityStatus({ ...usage, active: true, activeGroups }).label).toBe("2 个入口监测中");
    const summary = compactPrioritySummary({ ...usage, active: true, activeGroups });
    expect(summary.activeGroups).toEqual(activeGroups);
    expect(samePrioritySummary(summary, { ...summary, activeGroups: activeGroups.slice(1) })).toBe(false);
  });
});

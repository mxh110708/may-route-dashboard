import { describe, expect, it } from "vitest";
import { PRIORITY_LATENCY_PRESETS, priorityLatencyCeiling, priorityLatencyPreset } from "./priorityLatencyPresets";

describe("regional HTTPS latency budgets", () => {
  it.each([
    ["HK Entry", "hk"], ["🇭🇰 香港入口", "hk"], ["HongKong", "hk"], ["澳门", "hk"],
    ["Taipei Entry", "tw"], ["TW", "tw"], ["Tokyo", "jp"], ["韩国入口", "jp"],
    ["SG Entry", "sg"], ["马来西亚", "sea"], ["India", "in"],
    ["US-West-LA Entry", "us-west"], ["US-West-SF Entry", "us-west"], ["US-West-SJ Entry", "us-west"],
    ["🇺🇸 SJC Entry", "us-west"], ["US_Central Entry", "us-central"], ["US-East Entry", "us-east"],
    ["美国入口", "us"], ["Canada", "ca"], ["Europe Entry", "eu"], ["法兰克福", "eu"],
    ["UAE", "me"], ["Australia", "au"], ["巴西入口", "sa"], ["南非", "af"], ["CN Entry", "cn"],
  ])("recognizes the explicit regional label %s", (group, expected) => expect(priorityLatencyPreset(group)?.id).toBe(expected));
  it.each(["West", "Default Exit", "Private Entry", "AI Services", "unknown HKservice", "HK / US-West Entry", "US-East / US-West", "美国-香港", "Constructor", ""]) (
    "leaves unknown or mixed regions unconfigured: %s", group => expect(priorityLatencyPreset(group)).toBeNull(),
  );
  it("provides only bounded conservative budgets and never aliases US West to Hong Kong", () => {
    expect(new Set(PRIORITY_LATENCY_PRESETS.map(value => value.id)).size).toBe(PRIORITY_LATENCY_PRESETS.length);
    expect(PRIORITY_LATENCY_PRESETS.every(value => Number.isInteger(value.ceilingMs) && value.ceilingMs >= 100 && value.ceilingMs < 8000)).toBe(true);
    expect(priorityLatencyCeiling("US-West-SF Entry", {})).toBeGreaterThan(priorityLatencyCeiling("HK Entry", {})!);
  });
  it("supports a manual preset, explicit off and restoration of regional defaults", () => {
    expect(priorityLatencyCeiling("HK Entry", { "HK Entry": 2200 })).toBe(2200);
    expect(priorityLatencyCeiling("HK Entry", { "HK Entry": 0 })).toBeUndefined();
    expect(priorityLatencyCeiling("HK Entry", {})).toBe(200);
    expect(priorityLatencyCeiling("US-West-SF Entry", {})).toBe(450);
    expect(priorityLatencyCeiling("Private Entry", {})).toBeUndefined();
    expect(priorityLatencyCeiling("Private Entry", { "Private Entry": 3000 })).toBe(3000);
    expect(priorityLatencyCeiling("__proto__", {})).toBeUndefined();
  });
});

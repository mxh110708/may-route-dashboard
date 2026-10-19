import { describe, expect, it } from "vitest";
import { changePriorityDraft, movePriorityNode, priorityDraftChanged, priorityDraftError, priorityDraftForGroup } from "./prioritySettingsModel";
const settings = {enabled:true,group:"Entry",order:[],failureRounds:3,backupSuccessRounds:2,recoverySuccessRounds:3,recoveryStableMs:120000,failbackCooldownMs:60000,probeTimeoutMs:8000,healthyIntervalMs:30000,failureIntervalMs:10000};
describe("priority settings editor", () => {
  it("reorders without mutating source", () => {const original=["a","b","c"];expect(movePriorityNode(original,2,0)).toEqual(["c","a","b"]);expect(original).toEqual(["a","b","c"]);});
  it("ignores invalid drag and keyboard indexes", () => {for(const index of [-1,NaN,4,0.5])expect(movePriorityNode(["a"],index,0)).toEqual(["a"]);});
  it("allows following group order and prevents empty explicit order", () => {expect(priorityDraftError(settings,false,["a"])).toBeNull();expect(priorityDraftError(settings,true,["a"])).not.toBeNull();});
  it("rejects missing nodes and out of range settings", () => {expect(priorityDraftError({...settings,order:["gone"]},true,["a"])).not.toBeNull();expect(priorityDraftError({...settings,failureRounds:0},false,["a"])).not.toBeNull();expect(priorityDraftError({...settings,probeTimeoutMs:NaN},false,["a"])).not.toBeNull();});
  it("can disable monitoring when no profile is selected", () => {expect(priorityDraftError({...settings,enabled:false},false,[])).toBeNull();});
  it("switching editor regions restores each custom order without creating unsaved changes", () => {
    const base = { ...settings, group: "West", order: ["w2", "w1"], groupOrders: { West: ["w2", "w1"], Europe: ["e2", "e1"] } };
    const europe = priorityDraftForGroup(base, "Europe"), west = priorityDraftForGroup(europe, "West");
    expect(europe.order).toEqual(["e2", "e1"]); expect(west.order).toEqual(["w2", "w1"]);
    expect(priorityDraftChanged(europe, base)).toBe(false); expect(priorityDraftChanged(west, base)).toBe(false);
  });
  it("edits survive switching regions before one save, including disabling custom order for one group", () => {
    const base = { ...settings, group: "West", order: ["w1", "w2"] };
    const west = changePriorityDraft(base, { order: ["w2", "w1"] });
    const europe = changePriorityDraft(priorityDraftForGroup(west, "Europe"), { order: ["e2", "e1"] });
    expect(priorityDraftForGroup(europe, "West").order).toEqual(["w2", "w1"]);
    expect(priorityDraftChanged(europe, base)).toBe(true);
    const disabled = changePriorityDraft(europe, { order: [] });
    expect(priorityDraftForGroup(disabled, "Europe").order).toEqual([]);
    expect(priorityDraftForGroup(disabled, "West").order).toEqual(["w2", "w1"]);
    expect(base.order).toEqual(["w1", "w2"]);
  });
  it("after saving Europe, switching to West needs no second save", () => {
    const saved = changePriorityDraft(priorityDraftForGroup({ ...settings, group: "West", order: ["w2", "w1"] }, "Europe"), { order: ["e1"] });
    expect(priorityDraftChanged(priorityDraftForGroup(saved, "West"), saved)).toBe(false);
  });
});

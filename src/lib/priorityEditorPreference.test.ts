import { describe, expect, it } from "vitest";
import { parsePriorityEditorGroups, priorityEditorGroup } from "./priorityEditorPreference";

const groups = [{ tag: "West" }, { tag: "Europe" }];

describe("priority editor preference", () => {
  it("prefers the last viewed group over the last policy save and current monitor", () => {
    expect(priorityEditorGroup(groups, "West", "Europe", [{ group: "Europe" }])).toBe("West");
    expect(priorityEditorGroup(groups, "Europe", "West", [{ group: "West" }])).toBe("Europe");
  });

  it("falls back only to groups that still exist in this profile", () => {
    expect(priorityEditorGroup(groups, "Removed", "Europe")).toBe("Europe");
    expect(priorityEditorGroup(groups, undefined, "Removed", [{ group: "Gone" }, { group: "Europe" }])).toBe("Europe");
    expect(priorityEditorGroup(groups, "Removed", "Gone", [{ group: "Missing" }])).toBe("West");
    expect(priorityEditorGroup([], "West", "Europe", [{ group: "West" }])).toBe("");
  });

  it("stores only a group name for each profile without altering the input", () => {
    const saved = { first: "West", second: "Europe" };
    const parsed = parsePriorityEditorGroups(saved);
    expect(parsed).toEqual(saved);
    expect(parsed).not.toBe(saved);
    parsed.first = "Europe";
    expect(saved.first).toBe("West");
  });

  it("handles profile IDs and group names that match object property names", () => {
    const parsed = parsePriorityEditorGroups(JSON.parse('{"__proto__":"constructor","constructor":"West"}'));
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(parsed["__proto__"]).toBe("constructor");
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(priorityEditorGroup([{ tag: "constructor" }], parsed["__proto__"], "")).toBe("constructor");
  });

  it("rejects malformed values at the desktop preference boundary", () => {
    for (const value of [null, [], "West", { first: null }, { first: ["West"] }, { first: "" }, { "": "West" }]) {
      expect(() => parsePriorityEditorGroups(value)).toThrow("invalid priority editor groups preference");
    }
    expect(parsePriorityEditorGroups({})).toEqual({});
  });
});

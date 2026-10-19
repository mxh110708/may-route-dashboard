import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { ConnectionEventsSchema, ConnectionEventType as Event, LogLevel, StatusSchema } from "../gen/daemon/started_service_pb";
import { appendConnections, appendLogs, appendStatus, compactLogs, emptyConnections, emptyLogs, emptyStatus, logLevel } from "./streamData";

describe("stream data and retention", () => {
  it("compacts closed-page logs losslessly, including Unicode and ANSI, and can append without a replay", () => {
    const entries = [{ id: 7, level: LogLevel.WARN, message: '\u001b[31m中文😀\n"quoted"\\path\u0000' }];
    const before = appendLogs(logLevel(emptyLogs(), LogLevel.WARN), entries, false);
    const compact = compactLogs(before);
    expect(compact).not.toBe(before);
    expect(compactLogs(compact)).toBe(compact);
    expect(compact.entries).toEqual(entries);
    expect(compact.defaultLevel).toBe(LogLevel.WARN);
    const appended = appendLogs(compact, [{ id: 8, level: LogLevel.INFO, message: "next" }], false);
    expect(appended.entries.map(row => row.id)).toEqual([7, 8]);
    expect(compact.entries).toEqual(entries);
    const large = appendLogs(emptyLogs(), [{ id: 1, level: LogLevel.INFO, message: "x".repeat(600_000) }], false);
    expect(compactLogs(large)).toBe(large);
  });
  it("keeps exact totals and old rows, including rate falling to zero", () => {
    let data = appendConnections(emptyConnections(), create(ConnectionEventsSchema, { reset: true, events: [
      { type: Event.CONNECTION_EVENT_NEW, id: "a", connection: { id: "a", uplinkTotal: 100n } },
      { type: Event.CONNECTION_EVENT_NEW, id: "b", connection: { id: "b" } },
    ] }));
    const old = data;
    data = appendConnections(data, create(ConnectionEventsSchema, { events: [{ type: Event.CONNECTION_EVENT_UPDATE, id: "a", uplinkDelta: 10n }] }));
    expect(data.rows.get("a")?.uplinkTotal).toBe(110n);
    expect(old.rows.get("a")?.uplinkTotal).toBe(100n);
    expect(data.rows.get("b")).toBe(old.rows.get("b"));
    const zero = create(ConnectionEventsSchema, { events: [{ type: Event.CONNECTION_EVENT_UPDATE, id: "a" }] });
    data = appendConnections(data, zero);
    expect(data.rows.get("a")?.uplinkRate).toBe(0);
    expect(appendConnections(data, zero)).toBe(data);
    expect(appendConnections(data, create(ConnectionEventsSchema))).toBe(data);
  });

  it("evicts only the oldest closed rows, retaining all active connections and resets", () => {
    const events = Array.from({ length: 2050 }, (_, i) => ({ type: Event.CONNECTION_EVENT_NEW, id: String(i),
      connection: { id: String(i), closedAt: i < 1050 ? BigInt(i + 1) : 0n } }));
    const data = appendConnections(emptyConnections(), create(ConnectionEventsSchema, { events }));
    expect(data.rows.size).toBe(2000);
    expect(data.rows.get("0")).toBeUndefined(); expect(data.rows.get("49")).toBeUndefined();
    expect(data.rows.get("50")).toBeDefined(); expect(data.rows.get("2049")?.closedAt).toBeNull();
    const closed = appendConnections(data, create(ConnectionEventsSchema, { events: [{ type: Event.CONNECTION_EVENT_CLOSED, id: "2049", closedAt: 9999n }] }));
    expect(closed.rows.get("2049")?.closedAt).toBe(9999);
    expect(data.rows.get("2049")?.closedAt).toBeNull();
    const reset = appendConnections(closed, create(ConnectionEventsSchema, { reset: true }));
    expect(reset.rows.size).toBe(0); expect(reset.loaded).toBe(true);
  });

  it("retains log pause snapshots, levels and reset semantics at the existing 3000-line limit", () => {
    const rows = (from: number, length: number) => Array.from({ length }, (_, i) => ({ id: from + i, level: LogLevel.INFO, message: String(from + i) }));
    let data = logLevel(emptyLogs(), LogLevel.WARN);
    data = appendLogs(data, rows(0, 3100), false);
    const paused = data.entries;
    expect(paused).toHaveLength(3000); expect(paused[0].id).toBe(100);
    data = appendLogs(data, rows(3100, 100), false);
    expect(data.entries[0].id).toBe(200); expect(paused[0].id).toBe(100);
    expect(data.defaultLevel).toBe(LogLevel.WARN);
    data = appendLogs(data, rows(9000, 3), true);
    expect(data.entries.map(row => row.id)).toEqual([9000, 9001, 9002]);
    expect(appendLogs(data, [], false)).toBe(data);
    expect(appendLogs(data, [], true).entries).toEqual([]);
  });

  it("keeps exactly 30 ordered samples without changing an earlier chart snapshot", () => {
    let data = emptyStatus();
    for (let i = 0; i < 30; i++) data = appendStatus(data, create(StatusSchema, { uplink: BigInt(i), downlink: BigInt(i * 2) }));
    const old = data;
    data = appendStatus(data, create(StatusSchema, { uplink: 30n, downlink: 60n }));
    expect(data.uplinkHistory).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(data.downlinkHistory.at(-1)).toBe(60);
    expect(old.uplinkHistory[0]).toBe(0);
  });
});

import { create } from "@bufbuild/protobuf";
import { expect, it, vi } from "vitest";
import { DaemonApi } from "./daemon";
import { LogSchema, ServiceStatusSchema, ServiceStatus_Type } from "../gen/daemon/started_service_pb";

it("does not start RPCs after a page closes while optional stream code is loading", async () => {
  const api = new DaemonApi({ id: "test", name: "test", url: "127.0.0.1:1", secret: "" }, "en");
  const logs = vi.spyOn(api.client, "subscribeLog");
  const status = vi.spyOn(api.client, "subscribeStatus");
  const connections = vi.spyOn(api.client, "subscribeConnections");
  const closes = [api.logs.subscribe(() => {}), api.status.subscribe(() => {}), api.connections.subscribe(() => {})];
  closes.forEach(close => close());
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(logs).not.toHaveBeenCalled();
  expect(status).not.toHaveBeenCalled();
  expect(connections).not.toHaveBeenCalled();
});

it("leaving logs compacts history, unsubscribes status and ignores late callbacks; reopening replays the core snapshot", async () => {
  const api = new DaemonApi({ id: "test", name: "test", url: "127.0.0.1:1", secret: "" }, "en");
  let starts = 0, stopped = 0, statusStarts = 0, statusStopped = 0;
  const untilAbort = (signal?: AbortSignal) => new Promise<void>(resolve => {
    if (signal?.aborted) resolve();
    else signal?.addEventListener("abort", () => resolve(), { once: true });
  });
  vi.spyOn(api.client, "subscribeServiceStatus").mockImplementation(async function* (_request, options) {
    statusStarts++;
    try { yield create(ServiceStatusSchema, { status: ServiceStatus_Type.IDLE }); await untilAbort(options?.signal); }
    finally { statusStopped++; }
  });
  const logStream = vi.spyOn(api.client, "subscribeLog").mockImplementation(async function* (_request, options) {
    starts++;
    try {
      yield create(LogSchema, { reset: true, messages: Array.from({ length: 3000 }, (_, i) => ({ message: `${starts}/${i}` })) });
      await untilAbort(options?.signal);
      yield create(LogSchema, { messages: [{ message: "late frame must be ignored" }] });
    } finally { stopped++; }
  });
  for (let round = 1; round <= 20; round++) {
    const unsubscribe = api.logs.subscribe(() => {});
    await vi.waitFor(() => expect(api.logs.getSnapshot().data.entries[0]?.message).toBe(`${round}/0`));
    const paused = api.logs.getSnapshot().data.entries;
    expect(paused[0].message).toBe(`${round}/0`);
    unsubscribe();
    expect(api.logs.getSnapshot().data.entries).toEqual(paused);
    await vi.waitFor(() => expect(stopped).toBe(round));
    expect(api.logs.getSnapshot().data.entries).toEqual(paused);
    expect(paused).toHaveLength(3000);
  }
  expect(starts).toBe(20);
  await vi.waitFor(() => expect(statusStopped).toBe(statusStarts));
  const retained = api.logs.getSnapshot().data.entries;
  logStream.mockImplementationOnce(async function* () { yield await Promise.reject(new Error("offline")); });
  const closeOffline = api.logs.subscribe(() => {});
  await vi.waitFor(() => expect(api.logs.getSnapshot().phase).toBe("error"));
  expect(api.logs.getSnapshot().data.entries).toEqual(retained);
  closeOffline();
});

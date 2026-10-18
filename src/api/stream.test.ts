import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setStreamsSuspended, StreamStore } from "./stream";

describe("StreamStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    setStreamsSuspended(false);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("hidden desktop views stop streams, retain state and ignore late frames until resumed", async () => {
    let starts = 0, aborts = 0;
    let lateUpdate!: () => void;
    const store = new StreamStore<number>(() => 0, async ({ signal, update }) => {
      starts += 1;
      update(() => starts);
      lateUpdate = () => update(() => 999);
      signal.addEventListener("abort", () => { aborts += 1; });
      await new Promise(() => {});
    });
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot().data).toBe(1);
    setStreamsSuspended(true);
    expect(aborts).toBe(1);
    lateUpdate();
    store.reconnectNow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(starts).toBe(1);
    expect(store.getSnapshot().data).toBe(1);
    setStreamsSuspended(false);
    expect(starts).toBe(2);
    expect(store.getSnapshot().data).toBe(2);
    unsubscribe();
  });

  it("views first mounted while hidden do not start network streams until visible", () => {
    let starts = 0;
    setStreamsSuspended(true);
    const store = new StreamStore<number>(() => 0, async () => { starts += 1; await new Promise(() => {}); });
    const unsubscribe = store.subscribe(() => {});
    expect(starts).toBe(0);
    setStreamsSuspended(false);
    expect(starts).toBe(1);
    unsubscribe();
  });

  it("keeps non-replayable history subscribed while its existing view is hidden", () => {
    let starts = 0, aborts = 0;
    let receive!: (entry: number) => void;
    const store = new StreamStore<number[]>(() => [], async ({ signal, update }) => {
      starts++;
      receive = (entry) => update((entries) => entries.concat(entry));
      signal.addEventListener("abort", () => { aborts++; });
      await new Promise(() => {});
    }, true, false);
    const unsubscribe = store.subscribe(() => {});
    receive(1);
    setStreamsSuspended(true);
    receive(2);
    setStreamsSuspended(false);
    store.reconnectNow(true);
    expect(store.getSnapshot().data).toEqual([1, 2]);
    expect(starts).toBe(1);
    expect(aborts).toBe(0);
    store.reconnectNow();
    expect(starts).toBe(2);
    expect(aborts).toBe(1);
    unsubscribe();
    expect(aborts).toBe(2);
    expect(store.getSnapshot().data).toEqual([]);
  });

  it("releases unused rebuildable tables only after their last subscriber leaves", () => {
    const store = new StreamStore(() => new Map<number, string>(), async ({ update }) => {
      update(() => new Map([[1, "retained connection details"]]));
      await new Promise(() => {});
    }, true);
    const a = store.subscribe(() => {}), b = store.subscribe(() => {});
    a();
    expect(store.getSnapshot().data.size).toBe(1);
    b();
    expect(store.getSnapshot().data.size).toBe(0);
    const c = store.subscribe(() => {});
    expect(store.getSnapshot().data.get(1)).toBe("retained connection details");
    c();
  });

  it("collects hidden non-replayable events without UI notifications and publishes once on return", async () => {
    let receive!: (entry: number) => void;
    let aborts = 0;
    const store = new StreamStore<number[]>(() => [], async ({ signal, update }) => {
      receive = entry => update(entries => entries.concat(entry));
      signal.addEventListener("abort", () => { aborts++; });
      await new Promise(() => {});
    }, true, false);
    const notify = vi.fn();
    const unsubscribe = store.subscribe(notify);
    await vi.advanceTimersByTimeAsync(0);
    notify.mockClear();
    receive(1);
    setStreamsSuspended(true);
    for (let entry = 2; entry <= 1000; entry++) receive(entry);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(aborts).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    expect(store.getSnapshot().data).toHaveLength(1000);
    setStreamsSuspended(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().data[999]).toBe(1000);
    unsubscribe();
  });

  it("releases authoritative caches on last unsubscribe without resetting a live reconnect", () => {
    const store = new StreamStore(() => ["initial"], async ({ update }) => {
      update(() => ["latest authoritative data"]);
      await new Promise(() => {});
    }, false, true, true);
    const a = store.subscribe(() => {}), b = store.subscribe(() => {});
    a();
    expect(store.getSnapshot().data).toEqual(["latest authoritative data"]);
    b();
    expect(store.getSnapshot().data).toEqual(["initial"]);
    const next = store.subscribe(() => {});
    expect(store.getSnapshot().data).toEqual(["latest authoritative data"]);
    next();
  });

  it("preserves non-rebuildable history when its view leaves", () => {
    const store = new StreamStore(() => ["history"], async () => { await new Promise(() => {}); });
    store.subscribe(() => {})();
    expect(store.getSnapshot().data).toEqual(["history"]);
  });

  it("starts the stream on the first subscriber and publishes updates", async () => {
    const store = new StreamStore<number[]>(
      () => [],
      async ({ update }) => {
        update(() => [1]);
        await new Promise(() => {});
      },
    );
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    expect(store.getSnapshot().phase).toBe("active");
    expect(store.getSnapshot().data).toEqual([1]);
    await vi.advanceTimersByTimeAsync(0);
    expect(notified).toBeGreaterThan(0);
    unsubscribe();
  });

  it("coalesces a burst of updates into a single notification", async () => {
    const store = new StreamStore<number>(
      () => 0,
      async ({ update }) => {
        for (let i = 1; i <= 100; i += 1) {
          update(() => i);
        }
        await new Promise(() => {});
      },
    );
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    expect(store.getSnapshot().data).toBe(100);
    expect(notified).toBe(0);

    await vi.advanceTimersByTimeAsync(0);
    expect(notified).toBe(1);
    expect(store.getSnapshot().data).toBe(100);
    unsubscribe();
  });

  it("publishes updates while rendering frames are suspended", async () => {
    const requestFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.resetModules();
    const { StreamStore: FrameIndependentStreamStore } = await import("./stream");
    const store = new FrameIndependentStreamStore<number>(
      () => 0,
      async ({ update }) => {
        update(() => 1);
        await new Promise(() => {});
      },
    );
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(notified).toBe(1);
    expect(requestFrame).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("aborts the stream when the last subscriber leaves", () => {
    let aborted = false;
    const store = new StreamStore<null>(
      () => null,
      ({ signal }) => {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise(() => {});
      },
    );
    const unsubscribe = store.subscribe(() => {});
    expect(aborted).toBe(false);
    unsubscribe();
    expect(aborted).toBe(true);
  });

  it("reconnects with backoff after a retryable error", async () => {
    let calls = 0;
    const store = new StreamStore<null>(
      () => null,
      async () => {
        calls += 1;
        throw new Error("boom");
      },
    );
    const unsubscribe = store.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    expect(store.getSnapshot().phase).toBe("error");
    expect(store.getSnapshot().error).toBe("boom");

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    expect(store.getSnapshot().phase).toBe("error");
    expect(store.getSnapshot().error).toBe("boom");
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toBe(2);
    expect(store.getSnapshot().phase).toBe("error");
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(3);
    expect(store.getSnapshot().phase).toBe("error");
    unsubscribe();
  });

  it("keeps the last error visible while a reconnect attempt is pending", async () => {
    let calls = 0;
    let rejectFirst: (error: Error) => void = () => {};
    const store = new StreamStore<null>(
      () => null,
      () => {
        calls += 1;
        if (calls === 1) {
          return new Promise((_, reject) => {
            rejectFirst = reject;
          });
        }
        return new Promise(() => {});
      },
    );
    const unsubscribe = store.subscribe(() => {});

    rejectFirst(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot()).toMatchObject({ phase: "error", error: "offline" });

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    expect(store.getSnapshot()).toMatchObject({ phase: "error", error: "offline" });
    unsubscribe();
  });

  it("stops permanently on errors a retry cannot fix", async () => {
    let calls = 0;
    const store = new StreamStore<null>(
      () => null,
      async () => {
        calls += 1;
        throw new ConnectError("bad secret", Code.Unauthenticated);
      },
    );
    const unsubscribe = store.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().phase).toBe("error");
    expect(store.getSnapshot().errorCode).toBe(Code.Unauthenticated);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("restarts a fatally stopped stream when a subscriber returns", async () => {
    let calls = 0;
    const store = new StreamStore<null>(
      () => null,
      async () => {
        calls += 1;
        throw new ConnectError("bad secret", Code.Unauthenticated);
      },
    );
    const first = store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    first();

    const second = store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
    second();
  });

  it("retryNow cuts the backoff short and restarts the attempt counter", async () => {
    let calls = 0;
    const store = new StreamStore<null>(
      () => null,
      async () => {
        calls += 1;
        throw new Error("boom");
      },
    );
    const unsubscribe = store.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(3);

    store.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(4);

    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toBe(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(5);
    unsubscribe();
  });

  it("skips the next backoff when retryNow arrives before the failure", async () => {
    let calls = 0;
    let rejectCurrent: (error: Error) => void = () => {};
    const store = new StreamStore<null>(
      () => null,
      () => {
        calls += 1;
        return new Promise((_, reject) => {
          rejectCurrent = reject;
        });
      },
    );
    const unsubscribe = store.subscribe(() => {});
    expect(calls).toBe(1);

    store.retryNow();
    rejectCurrent(new Error("connection lost"));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
    unsubscribe();
  });

  it("reconnects an active stream immediately", async () => {
    let calls = 0;
    let aborted = 0;
    const store = new StreamStore<number>(
      () => 0,
      ({ signal, update }) => {
        calls += 1;
        update(() => calls);
        signal.addEventListener("abort", () => {
          aborted += 1;
        });
        return new Promise(() => {});
      },
    );
    const unsubscribe = store.subscribe(() => {});
    expect(calls).toBe(1);

    store.reconnectNow();
    expect(aborted).toBe(1);
    expect(calls).toBe(2);
    expect(store.getSnapshot()).toMatchObject({ phase: "active", data: 2 });
    unsubscribe();
  });

  it("resets data on reconnect when configured to", async () => {
    let calls = 0;
    const store = new StreamStore<number[]>(
      () => [],
      async ({ update }) => {
        calls += 1;
        update((data) => data.concat(calls));
        throw new Error("boom");
      },
      true,
    );
    const unsubscribe = store.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    expect(store.getSnapshot().data).toEqual([2]);
    unsubscribe();
  });
});

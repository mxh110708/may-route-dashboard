import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVisiblePoller } from "./visiblePoller";

function page(initiallyHidden = false) {
  const events = new EventTarget();
  let hidden = initiallyHidden;
  return {
    get hidden() { return hidden; },
    setHidden(value: boolean) { hidden = value; events.dispatchEvent(new Event("visibilitychange")); },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
}

describe("visible UI polling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does no hidden reads or timer wakeups, then refreshes immediately on return", async () => {
    const visibility = page(true);
    const read = vi.fn(async () => {});
    const poller = createVisiblePoller(read, 5000, visibility);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(2);
    visibility.setHidden(true);
    poller.refresh();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    poller.dispose();
  });

  it("coalesces changes during an in-flight read and never overlaps reads", async () => {
    const visibility = page();
    let finish!: () => void;
    const read = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const poller = createVisiblePoller(read, 5000, visibility);
    poller.refresh(); poller.refresh();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(read).toHaveBeenCalledTimes(1);
    visibility.setHidden(true); visibility.setHidden(false);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    poller.dispose(); finish();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    visibility.setHidden(false);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

import { Code, ConnectError } from "@connectrpc/connect";
import { useSyncExternalStore } from "react";

export type StreamPhase = "connecting" | "active" | "error";

export interface StreamSnapshot<T> {
  phase: StreamPhase;
  error?: string;
  errorCode?: Code;
  data: T;
}

export interface StreamContext<T> {
  signal: AbortSignal;
  update(updater: (data: T) => T): void;
}

export function describeError(error: unknown): { message: string; code?: Code } {
  if (error instanceof ConnectError) {
    return { message: error.rawMessage, code: error.code };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

export function isTerminalCode(code: Code | undefined): boolean {
  return (
    code === Code.Unimplemented ||
    code === Code.NotFound ||
    code === Code.Unauthenticated ||
    code === Code.PermissionDenied
  );
}

let streamsSuspended = false;
const activityListeners = new Set<(suspended: boolean) => void>();

/** Desktop-only visibility control; a hidden page retains component/input state. */
export function setStreamsSuspended(suspended: boolean): void {
  if (streamsSuspended === suspended) return;
  streamsSuspended = suspended;
  for (const listener of [...activityListeners]) listener(suspended);
}

export class StreamStore<T> {
  private listeners = new Set<() => void>();
  private snapshot: StreamSnapshot<T>;
  private controller: AbortController | null = null;
  private skipBackoff = false;
  private wakeBackoff: (() => void) | null = null;
  private flushHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly activityChanged = (suspended: boolean) => {
    if (suspended) {
      if (this.flushHandle !== null) clearTimeout(this.flushHandle);
      this.flushHandle = null;
      if (this.pauseWhenHidden) this.stop();
    } else if (this.listeners.size > 0) {
      if (this.pauseWhenHidden) this.start();
      this.scheduleNotification();
    }
  };

  constructor(
    private createInitial: () => T,
    private runStream: (context: StreamContext<T>) => Promise<void>,
    private resetOnReconnect = false,
    private pauseWhenHidden = true,
    private releaseWhenUnused = resetOnReconnect,
  ) {
    this.snapshot = { phase: "connecting", data: createInitial() };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      activityListeners.add(this.activityChanged);
      if (!this.pauseWhenHidden || !streamsSuspended) this.start();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
        activityListeners.delete(this.activityChanged);
        // These stores already rebuild from an authoritative reset on the next
        // subscription. Do not retain a large unused connection table meanwhile.
        if (this.releaseWhenUnused) this.snapshot = { phase: "connecting", data: this.createInitial() };
      }
    };
  };

  getSnapshot = (): StreamSnapshot<T> => this.snapshot;

  retryNow = (): void => {
    this.skipBackoff = true;
    this.wakeBackoff?.();
  };

  reconnectNow = (preserveActive = false): void => {
    if (this.listeners.size === 0 || (this.pauseWhenHidden && streamsSuspended)) {
      return;
    }
    if (preserveActive && this.controller !== null && this.snapshot.phase === "active") return;
    this.stop();
    this.start();
  };

  private setSnapshot(next: StreamSnapshot<T>) {
    this.snapshot = next;
    this.scheduleNotification();
  }

  private scheduleNotification() {
    // Non-replayable history keeps collecting while hidden, without rebuilding
    // the React tree for every event. Publish its latest snapshot on return.
    if (!streamsSuspended && this.listeners.size > 0 && this.flushHandle === null) {
      this.flushHandle = setTimeout(() => {
        this.flushHandle = null;
        for (const listener of this.listeners) {
          listener();
        }
      });
    }
  }

  private start() {
    if ((this.pauseWhenHidden && streamsSuspended) || this.controller !== null) return;
    const controller = new AbortController();
    this.controller = controller;
    this.skipBackoff = false;
    void this.loop(controller.signal);
  }

  private stop() {
    this.controller?.abort();
    this.controller = null;
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle);
      this.flushHandle = null;
    }
  }

  private async loop(signal: AbortSignal) {
    let attempt = 0;
    while (!signal.aborted) {
      const data = this.resetOnReconnect ? this.createInitial() : this.snapshot.data;
      if (this.snapshot.phase !== "error") {
        this.setSnapshot({ phase: "connecting", data });
      } else if (this.resetOnReconnect) {
        this.setSnapshot({ ...this.snapshot, data });
      }
      try {
        await this.runStream({
          signal,
          update: (updater) => {
            if (signal.aborted) return;
            attempt = 0;
            this.setSnapshot({ phase: "active", data: updater(this.snapshot.data) });
          },
        });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        const described = describeError(error);
        this.setSnapshot({
          ...this.snapshot,
          phase: "error",
          error: described.message,
          errorCode: described.code,
        });
        if (isTerminalCode(described.code)) {
          return;
        }
      }
      attempt += 1;
      await this.backoff(Math.min(1000 * attempt, 5000), signal);
      if (this.skipBackoff) {
        this.skipBackoff = false;
        attempt = 0;
      }
    }
  }

  private backoff(durationMs: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted || this.skipBackoff) {
        resolve();
        return;
      }
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        this.wakeBackoff = null;
        resolve();
      };
      const timer = setTimeout(finish, durationMs);
      signal.addEventListener("abort", finish, { once: true });
      this.wakeBackoff = finish;
    });
  }
}

const subscribeToNothing = () => () => {};

export function useStream<T>(store: StreamStore<T>, enabled = true): StreamSnapshot<T> {
  return useSyncExternalStore(enabled ? store.subscribe : subscribeToNothing, store.getSnapshot);
}

type VisibilitySource = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

/** Refresh visible UI only, with no hidden timer and at most one read in flight. */
export function createVisiblePoller(run: () => Promise<void>, intervalMs: number, visibility: VisibilitySource = document) {
  let disposed = false;
  let pending = false;
  let requested = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(timer);
    timer = undefined;
    if (disposed || visibility.hidden) return;
    if (pending) { requested = true; return; }
    pending = true;
    void run().finally(() => {
      pending = false;
      if (disposed || visibility.hidden) { requested = false; return; }
      if (requested) { requested = false; refresh(); }
      else timer = setTimeout(refresh, intervalMs);
    });
  };
  visibility.addEventListener("visibilitychange", refresh);
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      visibility.removeEventListener("visibilitychange", refresh);
    },
  };
}

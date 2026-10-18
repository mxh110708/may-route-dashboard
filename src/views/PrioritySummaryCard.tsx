import { useEffect, useState } from "react";
import type { DesktopHost, DesktopPriorityState } from "../app/desktop";
import { navigate } from "../app/context";
import { priorityOverviewPath } from "../app/priorityNavigation";
import { Icon } from "../components/Icon";
import { priorityStatus } from "./priorityStatus";
import { createVisiblePoller } from "../lib/visiblePoller";
import styles from "./PrioritySummaryCard.module.css";

export function PrioritySummaryCard({ host }: { host: DesktopHost }) {
  const read = host.profiles.priorityState;
  const [view, setView] = useState<DesktopPriorityState | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!read) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const next = await read();
        if (!stopped && !document.hidden) { setView(next); setFailed(false); }
      } catch {
        if (!stopped && !document.hidden) { setView(null); setFailed(true); }
      }
    };
    const poller = createVisiblePoller(refresh, 5000);
    return () => { stopped = true; poller.dispose(); };
  }, [read]);
  if (!read) return null;
  return <PrioritySummaryContent view={view} failed={failed} onOpen={() => navigate(priorityOverviewPath)} />;
}

export function PrioritySummaryContent({ view, failed, onOpen }: {
  view: DesktopPriorityState | null;
  failed: boolean;
  onOpen: () => void;
}) {
  const status = view ? priorityStatus(view) : { label: failed ? "状态读取失败" : "正在读取…", tone: failed ? "warning" : "neutral" };
  return <button type="button" className={`card wide ${styles.entry}`} onClick={onOpen} aria-label="自动故障切换，查看详情与设置">
    <span className="card-header"><Icon name="tune" /><span>自动故障切换</span><span className={styles.accessory}><span className={styles.state} data-tone={status.tone}>{status.label}</span><Icon name="keyboard_arrow_right" /></span></span>
    <span className={styles.node}>{view?.running ? view.selected ?? "等待节点状态" : failed ? "点击查看详情或重试" : view ? "代理未运行" : "正在读取当前节点"}</span>
    <span className={styles.meta}>{view ? view.settings.group || "尚未选择入口组" : "点击查看运行状态与策略"}{view?.needsReload ? " · 有待应用配置" : ""}</span>
  </button>;
}

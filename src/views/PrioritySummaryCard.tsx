import { useEffect, useState } from "react";
import type { DesktopHost, DesktopPrioritySummary } from "../app/desktop";
import { navigate } from "../app/context";
import { useI18n } from "../app/i18n";
import { priorityOverviewPath } from "../app/priorityNavigation";
import { Icon } from "../components/Icon";
import { compactPrioritySummary, priorityStatus, samePrioritySummary } from "./priorityStatus";
import { createVisiblePoller } from "../lib/visiblePoller";
import styles from "./PrioritySummaryCard.module.css";

export function PrioritySummaryCard({ host }: { host: DesktopHost }) {
  const { t } = useI18n();
  const read = host.profiles.prioritySummary ?? host.profiles.priorityState;
  const [view, setView] = useState<DesktopPrioritySummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!read) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const next = compactPrioritySummary(await read());
        if (!stopped && !document.hidden) {
          setView(current => samePrioritySummary(current, next) ? current : next);
          setFailed(false);
        }
      } catch {
        if (!stopped && !document.hidden) { setView(null); setFailed(true); }
      }
    };
    const poller = createVisiblePoller(refresh, 5000);
    return () => { stopped = true; poller.dispose(); };
  }, [read]);
  if (!read) return null;
  return <PrioritySummaryContent view={view} failed={failed} onOpen={() => navigate(priorityOverviewPath)} initializingLabel={t("Initializing monitoring")} />;
}

export function PrioritySummaryContent({ view, failed, onOpen, initializingLabel }: {
  view: DesktopPrioritySummary | null;
  failed: boolean;
  onOpen: () => void;
  initializingLabel?: string;
}) {
  const status = view ? priorityStatus(view, initializingLabel) : { label: failed ? "状态读取失败" : "正在读取…", tone: failed ? "warning" : "neutral" };
  const groups = view?.running ? view.activeGroups ?? [] : [];
  return <button type="button" className={`card wide ${styles.entry}`} onClick={onOpen} aria-label="自动故障切换，查看详情与设置">
    <span className="card-header"><Icon name="tune" /><span>自动故障切换</span><span className={styles.accessory}><span className={styles.state} data-tone={status.tone}>{status.label}</span><Icon name="keyboard_arrow_right" /></span></span>
    {groups.length > 0 ? <span className={styles.groups} role="list" aria-label="当前监测入口">
      {groups.map(group => <span className={styles.group} role="listitem" key={group.group}>
        <span className={styles.node}>{group.selected ?? "等待节点状态"}</span>
        <span className={styles.meta}>{group.group}</span>
      </span>)}
      {view?.needsReload && !view.initializing && <span className={styles.meta}>有待应用配置</span>}
    </span> : <>
      <span className={styles.node}>{view?.running ? view.selected ?? "等待节点状态" : failed ? "点击查看详情或重试" : view ? "代理未运行" : "正在读取当前节点"}</span>
      <span className={styles.meta}>{view ? view.settings.group || (view.usageAware ? "按实际流量监测入口" : "尚未选择入口组") : "点击查看运行状态与策略"}{view?.needsReload && !view.initializing ? " · 有待应用配置" : ""}</span>
    </>}
  </button>;
}

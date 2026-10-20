import { useState } from "react";
import type { DesktopProfilesState } from "../app/desktop";
import { Button, Dialog } from "./ui";
import styles from "./WindowsProxyStatus.module.css";

export function WindowsProxyStatus(props: {
  health: DesktopProfilesState["windowsProxyHealth"];
  busy: boolean;
  reapply?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!props.health || props.health === "unsupported") return null;
  const labels = {
    inactive: "未检测（服务停止或正在切换）",
    healthy: "已开启，地址匹配 May Route",
    confirming: "检测到开关关闭，正在复核",
    repairing: "正在恢复系统代理开关",
    foreign: "地址 / PAC / 自动检测已改变，已避让",
    suspended: "反复被关闭或曾被接管，已暂停自动恢复",
    unknown: "读取失败或恢复结果不明；未再次写入，请检查后重启代理",
  };
  const summaries = {
    inactive: "未检测", healthy: "系统代理正常", confirming: "正在复核",
    repairing: "正在恢复", foreign: "已避让其他设置", suspended: "自动恢复已暂停", unknown: "状态未知",
  };
  const attention = ["foreign", "suspended", "unknown"].includes(props.health);
  return (
    <div className={styles.status} data-attention={attention || undefined}>
      <button type="button" className={styles.trigger} aria-label={`Windows 系统代理：${summaries[props.health]}，查看详情`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <span className={styles.dot} data-health={props.health} aria-hidden="true" />
          <span role="status" aria-live="polite">{summaries[props.health]}</span>
      </button>
      {open && <Dialog onClose={() => setOpen(false)}>
        <h2>Windows 系统代理</h2>
        <div className={styles.detail}>
          <p>{labels[props.health]}。此状态仅反映 Windows 系统代理设置，不代表节点或网站连通性。</p>
          {props.health === "suspended" && props.reapply && (
            <Button size="small" disabled={props.busy} onClick={props.reapply}>重新核对并恢复</Button>
          )}
        </div>
        <Button onClick={() => setOpen(false)}>关闭</Button>
      </Dialog>}
    </div>
  );
}

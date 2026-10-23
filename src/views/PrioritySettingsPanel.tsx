import { useEffect, useRef, useState } from "react";
import type { DesktopHost, DesktopPrioritySettings, DesktopPriorityState } from "../app/desktop";
import { Button, Dialog, Field, Select, Switch } from "../components/ui";
import { changePriorityDraft, movePriorityNode, priorityDraftChanged, priorityDraftError, priorityDraftForGroup } from "./prioritySettingsModel";
import { priorityStatus } from "./priorityStatus";
import { Icon } from "../components/Icon";
import { createVisiblePoller } from "../lib/visiblePoller";
import { useI18n } from "../app/i18n";
import { PRIORITY_LATENCY_PRESETS, priorityLatencyCeiling, priorityLatencyPreset } from "../lib/priorityLatencyPresets";
import styles from "./PrioritySettingsPanel.module.css";

type NumberKey = Exclude<keyof DesktopPrioritySettings, "enabled" | "groupLatencyCeilings" | "group" | "order" | "groupOrders">;
const numbers: { key: NumberKey; label: string; min: number; max: number; seconds?: boolean }[] = [
  { key: "failureRounds", label: "故障确认次数", min: 1, max: 20 },
  { key: "backupSuccessRounds", label: "备用连续成功次数", min: 1, max: 20 },
  { key: "recoverySuccessRounds", label: "恢复连续成功次数", min: 1, max: 20 },
  { key: "recoveryStableMs", label: "切回前稳定时间（秒）", min: 10, max: 3600, seconds: true },
  { key: "failbackCooldownMs", label: "切回冷却时间（秒）", min: 10, max: 3600, seconds: true },
  { key: "probeTimeoutMs", label: "单次探测超时（秒）", min: 1, max: 60, seconds: true },
  { key: "healthyIntervalMs", label: "正常探测间隔（秒）", min: 5, max: 600, seconds: true },
  { key: "failureIntervalMs", label: "异常探测间隔（秒）", min: 5, max: 600, seconds: true },
];

export function PrioritySettingsPanel({ host }: { host: DesktopHost }) {
  const { t } = useI18n();
  const api = host.profiles;
  const [view, setView] = useState<DesktopPriorityState | null>(null);
  const [base, setBase] = useState<DesktopPriorityState | null>(null);
  const [draft, setDraft] = useState<DesktopPrioritySettings | null>(null);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const generation = useRef(0);
  const mutating = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragStart = useRef(0);
  const dragActive = useRef(false);
  const dragTarget = useRef<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const nodeList = useRef<HTMLOListElement>(null);
  const editingGroup = useRef("");
  const cancelDrag = () => { dragActive.current = false; setDragging(null); setDropTarget(null); dragTarget.current = null; setDragOffset(0); };
  const accept = (value: DesktopPriorityState) => {
    const group = value.groups.some(group => group.tag === editingGroup.current) ? editingGroup.current :
      value.groups.some(group => group.tag === value.settings.group) ? value.settings.group : value.activeGroups?.[0]?.group ?? value.groups[0]?.tag ?? "";
    editingGroup.current = group;
    const next = priorityDraftForGroup(value.settings, group);
    setView(value); setBase(value); setDraft(next); setCustom(next.order.length > 0);
  };
  const dirty = !!draft && !!base && (priorityDraftChanged(draft, base.settings) || custom !== (priorityDraftForGroup(base.settings, draft.group).order.length > 0));
  useEffect(() => {
    if (!api.priorityState) return;
    let stale = false;
    let request = 0;
    const poll = async () => {
      if (mutating.current) return;
      const stamp = generation.current;
      const current = ++request;
      try {
        const value = await api.priorityState!();
        if (!stale && !document.hidden && current === request && stamp === generation.current) { if (dirty) setView(value); else accept(value); }
      } catch (reason) {
        if (!stale && !document.hidden && current === request && stamp === generation.current) setError(String(reason));
      }
    };
    const poller = createVisiblePoller(poll, 5000);
    const unsubscribe = api.onChanged(poller.refresh);
    return () => { stale = true; poller.dispose(); unsubscribe(); };
  }, [api, dirty]);
  if (!api.priorityState || !api.prioritySave || !api.priorityApply) return null;
  const nodes = view?.groups.find(group => group.tag === draft?.group)?.nodes ?? [];
  const conflict = !!view && !!base && (view.revision !== base.revision || view.profileId !== base.profileId);
  const validation = draft ? priorityDraftError(draft, custom, nodes) : null;
  const order = draft ? custom ? draft.order : nodes : [];
  const change = (patch: Partial<DesktopPrioritySettings>) => { setDraft(current => current ? changePriorityDraft(current, patch) : current); setMessage(""); };
  const ceiling = draft ? priorityLatencyCeiling(draft.group, draft.groupLatencyCeilings) : undefined;
  const ceilingValue = draft && Object.hasOwn(draft.groupLatencyCeilings, draft.group) ? draft.groupLatencyCeilings[draft.group] : ceiling;
  const preset = draft ? priorityLatencyPreset(draft.group) : null;
  const changeCeiling = (value: number | null) => {
    if (!draft?.group) return;
    const limits = { ...draft.groupLatencyCeilings };
    if (value === null) delete limits[draft.group]; else Object.defineProperty(limits, draft.group, { value, enumerable: true, configurable: true, writable: true });
    change({ groupLatencyCeilings: limits });
  };
  const save = async () => {
    if (!draft || !base || validation || conflict) return;
    generation.current++; mutating.current = true; setBusy(true); setError("");
    try {
      const value = await api.prioritySave!(draft, base.revision, base.profileId); accept(value);
      setMessage(value.initializing ? t("Entry policies saved. Monitoring is initializing and will continue automatically.") : value.needsReload ? "各入口策略已保存。当前代理缺少所需探测入口，请重载一次后使用。" : "顺序与延迟上限已保存，各入口组独立记忆。监测按实际流量自动应用，切换地区无需再次保存或重载。");
    }
    catch (reason) { setError(String(reason)); } finally { mutating.current = false; setBusy(false); }
  };
  const refresh = async () => {
    generation.current++; mutating.current = true; setBusy(true); setError("");
    try { accept(await api.priorityState!()); setMessage(""); } catch (reason) { setError(String(reason)); } finally { mutating.current = false; setBusy(false); }
  };
  const apply = async () => {
    if (!base) return;
    generation.current++; mutating.current = true; setConfirm(false); setBusy(true); setError("");
    try { await api.priorityApply!(base.revision, base.profileId); accept(await api.priorityState!()); setMessage("代理已重新加载，保存的策略已应用。"); }
    catch (reason) { setError(`已保存，但未确认重载完成：${String(reason)}`); } finally { mutating.current = false; setBusy(false); }
  };
  const status = view ? priorityStatus(view, t("Initializing monitoring")) : null;
  return <section className={styles.panel} aria-label="自动故障切换设置">
    {error && <p role="alert">{error}</p>}
    {!draft || !view || !base ? <p>正在读取策略配置…</p> : <>
      <div className={`nav-list ${styles.group}`}>
        <div className={styles.row}>
          <div className={styles.rowLabel}>启用自动故障切换<p>入口故障时切换备用，首选稳定恢复后切回。</p></div>
          <Switch label="启用自动故障切换" value={draft.enabled} disabled={busy} onChange={enabled => change({ enabled })} />
        </div>
        <div className={styles.row} aria-live="polite"><span className={styles.muted}>运行状态</span><span className={styles.state} data-tone={status!.tone}>{status!.label}</span></div>
        {view.usageAware ? <>
          <div className={styles.row}><span className={styles.muted}>当前监测入口</span><span className={styles.value}>{view.activeGroups?.length ? `${view.activeGroups.length} 个正在使用的入口组` : "等待入口流量"}</span></div>
          {view.activeGroups?.map(group => <div className={styles.row} key={group.group}><span className={styles.muted}>{group.group}</span><span className={styles.value}>{group.selected ?? "等待节点状态"}{group.preferred && group.selected !== group.preferred ? ` · 首选 ${group.preferred}` : ""}</span></div>)}
        </> : <>
          <div className={styles.row}><span className={styles.muted}>当前节点</span><span className={styles.value}>{view.running ? view.selected ?? "—" : "—"}</span></div>
          {view.active && <div className={styles.row}><span className={styles.muted}>当前首选</span><span className={styles.value}>{view.preferred === view.selected && view.preferred ? "与当前节点相同" : view.preferred ?? "—"}</span></div>}
        </>}
        {view.lastSwitch && <details className={styles.details}><summary>最近切换<span className={styles.summaryHint}>{new Date(view.lastSwitch.at).toLocaleTimeString()}</span></summary><div className={styles.detailBody}><p>{view.lastSwitch.from} → {view.lastSwitch.to}</p><p>{view.lastSwitch.reason}</p></div></details>}
      </div>
      {view.active && ((view.activeGroups?.some(group => !group.monitoredSelected)) ?? (view.selected && !view.monitoredSelected)) && <p role="alert">部分正在使用的节点不在对应入口组的顺序中，不受自动切换保护；可将其加入该组顺序并保存。</p>}
      {view.initializing && <p role="status">{t("Initializing monitoring. Active entry groups will be read automatically when ready.")}</p>}
      {view.needsReload && !view.initializing && <p role="status">当前代理配置缺少匹配的探测入口，重载一次或下次启动后即可按实际流量自动监测。</p>}
      {view.usageAware && view.running && draft.enabled && view.activityAvailable === false && !view.needsReload && !view.initializing && <p role="status">正在读取实际使用的入口组；读取恢复后自动继续监测。</p>}
      {view.reconciled && <p role="status">已根据当前配置同步策略，失效节点及已移除分组的延迟上限已排除；有效节点保留原有顺序。新增节点可从“加入备用节点”选择；原顺序全部失效时跟随当前组的顺序。</p>}
      {conflict && <p role="alert">配置文件或当前配置已在其他位置变化，请刷新后再保存。</p>}
      {dirty && <p>有未保存修改，当前运行策略不受影响。</p>}
      {draft.group && !view.groups.some(group => group.tag === draft.group) && <p role="alert">已保存的分组“{draft.group}”不存在或不符合入口代理组结构，请重新选择；不会自动改用其他分组。</p>}
      <div>
      <div className="list-section-title">入口与顺序</div>
      <div className={`nav-list ${styles.group}`}>
      <div className={styles.controlRow}><Field label="入口代理组"><Select value={view.groups.some(group => group.tag === draft.group) ? draft.group : ""} placeholder="请选择入口代理组" disabled={busy} options={[
        ...view.groups.map(group => ({ value: group.tag, label: group.tag })),
      ]} onChange={group => {
        generation.current++; cancelDrag(); editingGroup.current = group;
        const next = priorityDraftForGroup(draft, group); setDraft(next); setCustom(next.order.length > 0); setMessage("");
      }} /></Field></div>
      <div className={styles.row}><div className={styles.rowLabel}>自定义顺序<p>{custom ? "拖动节点或使用箭头调整顺序。" : "跟随当前配置中的组内排列。"}</p></div><Switch label="自定义顺序" value={custom} disabled={busy} onChange={value => {
        setCustom(value); change({ order: value ? [...nodes] : [] });
      }} /></div>
      <ol ref={nodeList} className={styles.nodes} aria-label="节点优先级">
        {order.map((tag, index) => <li key={tag} data-node={tag} data-dragging={dragging === tag || undefined}
          style={dragging === tag ? { transform: `translateY(${dragOffset}px)` } : undefined}
          data-drop={dropTarget === tag && dragging !== tag ? (order.indexOf(dragging!) < index ? "after" : "before") : undefined}
          >
          {custom && <button type="button" className={styles.dragHandle} disabled={busy} aria-label={`拖动排序 ${tag}`} title="拖动排序；键盘可用上下方向键"
            onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragActive.current = true; dragTarget.current = null; dragStart.current = event.clientY; setDragging(tag); setDragOffset(0); }}
            onPointerMove={event => {
              if (!dragActive.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              setDragOffset(event.clientY - dragStart.current);
              const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLLIElement>("li[data-node]");
              const targetTag = target && nodeList.current?.contains(target) ? target.dataset.node ?? null : null;
              dragTarget.current = targetTag; setDropTarget(targetTag);
            }}
            onPointerUp={event => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              if (dragActive.current && custom && !busy && dragTarget.current) change({ order: movePriorityNode(order, order.indexOf(tag), order.indexOf(dragTarget.current)) });
              event.currentTarget.releasePointerCapture(event.pointerId); cancelDrag();
            }} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
            onKeyDown={event => {
              if (event.key === "Escape") { cancelDrag(); return; }
              if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); change({ order: movePriorityNode(order, index, index + (event.key === "ArrowUp" ? -1 : 1)) }); }
            }}><Icon name="drag_handle" /></button>}
          <span className={styles.rank} aria-label={`优先级 ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><span className={styles.nodeName}>{tag}<span className={styles.nodeHint}>{index === 0 ? "默认首选" : `备用 ${index}`}</span></span>
          {custom && <div className={styles.actions}>
            <Button size="small" disabled={busy || index === 0} aria-label={`上移 ${tag}`} onClick={() => change({ order: movePriorityNode(order, index, index - 1) })}>↑</Button>
            <Button size="small" disabled={busy || index === order.length - 1} aria-label={`下移 ${tag}`} onClick={() => change({ order: movePriorityNode(order, index, index + 1) })}>↓</Button>
            <Button size="small" disabled={busy} aria-label={`移除 ${tag}`} onClick={() => change({ order: order.filter(item => item !== tag) })}>移除</Button>
          </div>}
        </li>)}
      </ol>
      {order.length === 0 && <p className={styles.empty}>暂无参与节点，请先选择入口代理组。</p>}
      {custom && nodes.some(tag => !order.includes(tag)) && <div className={styles.controlRow}><Field label="加入备用节点"><Select value="" placeholder="选择要加入的节点" disabled={busy}
        options={nodes.filter(tag => !order.includes(tag)).map(tag => ({ value: tag, label: tag }))} onChange={tag => change({ order: [...order, tag] })} /></Field></div>}
      </div>
      <p className={styles.caption}>每个入口组分别保存顺序。下拉用于查看和编辑；实际流量同时使用多个地区时，各组分别监测和切换，切换地区无需重新保存。业务结束后保留约 1 分钟监测，避免短连接反复启停。</p>
      <p className={styles.caption}>手动选中顺序内节点后，以该节点为首选；故障时跳过当前节点，按该组顺序选择健康备用。</p>
      {view.groups.length === 0 && <p role="alert">当前配置没有符合条件的入口代理组。</p>}
      </div>
      <div className={`nav-list ${styles.group}`}>
      <details className={styles.details}><summary>切换规则<span className={styles.summaryHint}>探测与恢复</span></summary><div className={styles.detailBody}>
        <p>分组从当前配置读取，仅包含实际代理节点；业务、汇总、直连和混合组不参与。从自定义顺序移除的节点不受监测。</p>
        <p>当前节点独立探测，不等待备用探测完成。首次失败后约 1 秒再次复核，达到设定次数才切换；1 秒不包含探测耗时，不代表 1 秒内完成切换。</p>
        <p>每次探测需三个 HTTPS 目标中至少两个成功。备用须连续通过检测，且跳过当前节点；全部不可用时保持当前选择，不转为直连。按配置顺序选择合格节点，不持续追逐最低延迟。</p>
        <p>手动改选受监测节点会更新当前首选，仍受故障切换保护。恢复需同时满足连续成功、稳定时间和冷却条件；自动重载保留当前首选。</p>
      </div></details>
      <details className={styles.details}><summary>高级参数<span className={styles.summaryHint}>确认次数 · 探测间隔</span></summary><div className={styles.detailBody}>
      <p>次数按各节点连续探测结果计算。异常间隔用于常规重试，不影响当前节点首次失败后的快速复核。</p><div className={styles.grid}>
        {numbers.map(item => <div key={item.key}><Field label={item.label}><input className="input" type="number" min={item.min} max={item.max} step={1} disabled={busy} aria-describedby={`priority-${item.key}-range`}
          value={Number.isFinite(draft[item.key]) ? draft[item.key] / (item.seconds ? 1000 : 1) : ""}
          onChange={event => change({ [item.key]: event.target.value === "" ? NaN : Number(event.target.value) * (item.seconds ? 1000 : 1) })} /></Field><p className={styles.range} id={`priority-${item.key}-range`}>{item.min}–{item.max}{item.seconds ? " 秒" : " 次"}</p></div>)}
      </div></div></details>
      <details className={styles.details}><summary>{t("High-latency failover")}</summary><div className={styles.detailBody}>
        <p>{t("Each entry group has its own absolute limit. Major regions use conservative presets; unknown or mixed regions use connectivity checks until configured.")}</p>
        <p>{preset ? t("Regional default: {region}, {milliseconds} ms.", { region: t(preset.label), milliseconds: preset.ceilingMs }) : t("No unambiguous regional default for this group.")}</p>
        <div className={styles.grid}>
          <Field label={t("Apply regional preset")}><Select value="" placeholder={t("Choose a region")} disabled={busy || !draft.group}
            options={PRIORITY_LATENCY_PRESETS.map(item => ({ value: item.id, label: `${t(item.label)} · ${item.ceilingMs} ms` }))}
            onChange={id => { const selected = PRIORITY_LATENCY_PRESETS.find(item => item.id === id); if (selected) changeCeiling(selected.ceilingMs); }} /></Field>
          <Field label={t("Proxy response limit for this group (ms)")}><input className="input" type="number" min={0} max={60000} step={1}
            disabled={busy || !draft.group} value={Number.isFinite(ceilingValue) && ceilingValue !== 0 ? ceilingValue : ""}
            onChange={event => changeCeiling(event.target.value === "" ? 0 : Number(event.target.value))} /></Field>
        </div>
        <p>{t("Saved independently for this group. Use 100–60000 ms; zero or an empty value disables high-latency switching for this group.")}</p>
        <Button size="small" disabled={busy || !draft.group || !Object.hasOwn(draft.groupLatencyCeilings, draft.group)} onClick={() => changeCeiling(null)}>{t("Restore regional default")}</Button>
        <p>{t("Three consecutive over-limit probes must span at least 10 seconds. Recurring failures or slow rounds also count: by default, three of the last five rounds within two minutes, including the latest, must be abnormal. One isolated incident does not switch nodes.")}</p>
        <p>{t("The response limit measures the second-fastest successful HTTP response after TLS. Complete HTTPS requests also have a budget of four times this limit, at least 1500 ms. Neither is ICMP ping. Backups need a 20% margin for both measurements; stable recovery and cooldown still apply.")}</p>
        <p>{t("Presets are initial response budgets for access from mainland China. Adjust them for your network; unmeasured regions remain provisional.")}</p>
      </div></details>
      <details className={styles.details}><summary>配置文件</summary><div className={styles.detailBody}><p className={styles.path}>{view.path}</p></div></details>
      </div>
      {validation && <p role="alert">{validation}</p>}
      {message && <p role="status">{message}</p>}
      <div className={styles.actions}>
        <Button variant="primary" disabled={busy || (!dirty && !view.reconciled) || conflict || !!validation} onClick={() => void save()}>保存配置</Button>
        {view.needsReload && !view.initializing && <Button disabled={busy || dirty || conflict || !view.running} onClick={() => setConfirm(true)}>重载并应用</Button>}
        <Button disabled={busy} onClick={() => void refresh()}>{dirty ? "放弃未保存修改并刷新" : "刷新"}</Button>
      </div>
    </>}
    {confirm && <Dialog onClose={() => setConfirm(false)}>
      <h2>重载代理？</h2>
      <p>会短暂中断现有连接并应用已保存的策略；当前首选若仍在节点顺序中会保留。</p>
      <div className={styles.actions}><Button onClick={() => setConfirm(false)}>取消</Button><Button variant="primary" onClick={() => void apply()}>确认重载</Button></div>
    </Dialog>}
  </section>;
}

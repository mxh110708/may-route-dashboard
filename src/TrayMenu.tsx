import { useEffect, useMemo, useRef, useState } from "react";

import { DaemonApi } from "./api/daemon";
import type { Server } from "./api/config";
import { urlTestDelayTone } from "./api/format";
import { useStream } from "./api/stream";
import { applyAccent, applyTheme, loadAccentPreference, loadThemePreference, watchSystemTheme } from "./app/context";
import { useDaemonConnection, useDesktopProfiles } from "./app/desktop";
import type { DesktopHost } from "./app/desktop";
import { dismissError, showError, useCurrentError } from "./app/errorStore";
import { I18nProvider, useI18n } from "./app/i18n";
import { useInterfaceTypography } from "./app/interfaceFont";
import { Icon } from "./components/Icon";
import type { IconName } from "./components/Icon";
import { Spinner, Switch } from "./components/ui";
import { ServiceStatus_Type } from "./gen/daemon/started_service_pb";
import { watchStoredValues } from "./lib/storage";
import styles from "./TrayMenu.module.css";

const TRAY_LOCAL_SERVER: Server = { id: "tray-local", name: "MXH Route", url: "", secret: "" };
type Page = "home" | "groups" | "nodes" | "profiles";

export function TrayMenu({ desktop }: { desktop: DesktopHost }) {
  return <I18nProvider><TrayMenuContent host={desktop} /></I18nProvider>;
}

function TrayMenuContent({ host }: { host: DesktopHost }) {
  const { t, language } = useI18n();
  useInterfaceTypography(host);
  const api = useMemo(() => new DaemonApi(TRAY_LOCAL_SERVER, language, host.transport), [host, language]);
  const connection = useDaemonConnection(host);
  const service = useStream(api.serviceStatus);
  const groups = useStream(api.groups);
  const routing = useStream(api.clashMode);
  const { profiles, selectedId, captureMode } = useDesktopProfiles(host);
  const [page, setPage] = useState<Page>("home");
  const [groupTag, setGroupTag] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const executing = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const error = useCurrentError();
  const status = service.data.status?.status ?? ServiceStatus_Type.IDLE;
  const started = status === ServiceStatus_Type.STARTED;
  const transitioning = status === ServiceStatus_Type.STARTING || status === ServiceStatus_Type.STOPPING;
  const connected = connection.phase === "connected";
  const running = connected && started;
  const disabled = busy || transitioning;
  const selected = profiles.find((profile) => profile.id === selectedId);
  const selectable = groups.data.groups.filter((group) => group.selectable);
  const group = selectable.find((group) => group.tag === groupTag);
  const back = () => { setPage(page === "nodes" ? "groups" : "home"); setSearch(""); };
  const open = (route: string) => { host.application.showMainWindow(route); host.application.closeTrayMenu(); };
  const run = (action: () => Promise<unknown>) => {
    if (executing.current) return;
    executing.current = true;
    setBusy(true);
    void action().catch(showError).finally(() => {
      executing.current = false;
      setBusy(false);
      api.serviceStatus.reconnectNow();
      api.groups.reconnectNow();
      api.clashMode.reconnectNow();
    });
  };

  useEffect(() => {
    const apply = () => { applyTheme(loadThemePreference()); applyAccent(loadAccentPreference()); };
    apply();
    const system = watchSystemTheme(loadThemePreference), stored = watchStoredValues(apply);
    return () => { system(); stored(); };
  }, []);
  useEffect(() => {
    const opened = () => {
      setPage("home"); setSearch("");
      api.serviceStatus.reconnectNow(); api.groups.reconnectNow(); api.clashMode.reconnectNow();
      requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    };
    window.addEventListener("tray-menu-open", opened);
    return () => window.removeEventListener("tray-menu-open", opened);
  }, [api]);
  useEffect(() => {
    if (started) { api.groups.retryNow(); api.clashMode.retryNow(); }
  }, [started, api]);

  const row = (label: string, action: () => void, icon?: IconName, detail?: string, unavailable = false) => (
    <button type="button" className={styles.row} disabled={disabled || unavailable} onClick={action}>
      {icon && <Icon name={icon} size={17} />}<span className={styles.rowLabel}>{label}</span>
      {detail && <span className={styles.detail}>{detail}</span>}
    </button>
  );
  const modeLabel = (mode: string) => mode.toLowerCase() === "rule" ? t("Rule") : mode.toLowerCase() === "global" ? t("Global") : mode.toLowerCase() === "direct" ? t("Direct") : mode;
  const matches = (name: string) => name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const title = page === "groups" ? t("Groups") : page === "profiles" ? t("Profiles") : group?.tag ?? t("Groups");
  return <div className={styles.viewport} onMouseDown={(event) => { if (event.target === event.currentTarget) host.application.closeTrayMenu(); }}>
    <div ref={panel} className={styles.panel} role="dialog" aria-label={t("Tray menu")} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); if (page === "home") host.application.closeTrayMenu(); else back(); return; }
      if (event.target instanceof HTMLInputElement && event.key !== "Tab") return;
      if (!["ArrowDown", "ArrowUp", "Tab"].includes(event.key)) return;
      const items = [...panel.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
      if (!items.length) return;
      const step = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
      const current = items.indexOf(document.activeElement as HTMLElement);
      items[(current + step + items.length) % items.length].focus(); event.preventDefault();
    }}>
      <header className={styles.header}>
        {page !== "home" && <button type="button" className={styles.iconButton} aria-label={t("Back")} onClick={back}><Icon name="arrow_back" size={18} /></button>}
        <div className={styles.heading}><strong>{page === "home" ? "MXH Route" : title}</strong>
          <span className={styles.status}>{busy ? t("Please wait") : status === ServiceStatus_Type.STOPPING ? t("Service stopping...") : transitioning ? t("Service starting...") : running ? t("Service is Running") : connected ? t("Service not started") : t("Disconnected")}</span></div>
        {page === "home" && <Switch label={t("Service")} value={started || transitioning} disabled={disabled || !connected || (!started && !selectedId)} onChange={(enabled) => run(() => enabled ? host.service.start() : host.service.stop())} />}
      </header>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" aria-label={t("Ok")} onClick={dismissError}><Icon name="close" size={16} /></button></div>}
      {page !== "home" && <input className={styles.search} type="search" value={search} placeholder={t("Search")} aria-label={t("Search")} onChange={(event) => setSearch(event.target.value)} />}
      <div className={styles.body}>
        {page === "home" ? <>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>{t("Traffic Capture")}</div>
            <div className={styles.choices} role="radiogroup" aria-label={t("Traffic Capture")}>
              {(["system-proxy", "tun"] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={captureMode === mode} disabled={disabled || !connected} onClick={() => { if (mode !== captureMode) run(() => host.profiles.setCaptureMode(mode)); }}>{mode === "tun" ? t("TUN Mode") : t("System Proxy")}</button>)}
            </div>
            {!started && <p className={styles.hint}>{t("Used when the service starts")}</p>}
            <div className={styles.sectionTitle}>{t("Routing Mode")}</div>
            <div className={styles.choices} role="radiogroup" aria-label={t("Routing Mode")}>
              {routing.data.modeList.length ? routing.data.modeList.map((mode) => <button key={mode} type="button" role="radio" aria-checked={routing.data.currentMode === mode} disabled={disabled || !running} onClick={() => { if (mode !== routing.data.currentMode) run(() => api.setClashMode(mode)); }}>{modeLabel(mode)}</button>) : <span className={styles.hint}>{t("Service not started")}</span>}
            </div>
          </section>
          <section className={styles.section}>
            {row(t("Groups"), () => setPage("groups"), "folder", String(selectable.length), !running)}
            {row(t("Profiles"), () => setPage("profiles"), "description", selected?.name ?? t("Empty profiles"))}
            {row(t("Reload profile"), () => run(() => host.service.start()), "sync", undefined, !running || !selectedId)}
            {row(t("Close All Connections"), () => run(() => api.closeAllConnections()), "close", undefined, !running)}
          </section>
          <section className={styles.section}>
            {row(t("Connections"), () => open("connections"), "swap_vert")}
            {row(t("Logs"), () => open("logs"), "terminal")}
            {row(t("Settings"), () => open("settings"), "settings")}
            {host.application.openDataDirectory && row(t("Open data directory"), () => run(() => host.application.openDataDirectory!()), "folder")}
          </section>
        </> : page === "profiles" ? <>
          {profiles.filter((profile) => matches(profile.name)).map((profile) => <div key={profile.id} className={styles.profile}>
            <button type="button" className={styles.row} disabled={disabled || !connected} onClick={() => { if (profile.id !== selectedId) run(() => host.profiles.select(profile.id)); }}>
              <span className={styles.check}>{profile.id === selectedId && <Icon name="check" size={17} />}</span><span className={styles.rowLabel}>{profile.name}</span>
            </button>
            {profile.type === "remote" && <button type="button" className={styles.iconButton} aria-label={`${t("Update")} ${profile.name}`} title={t("Update")} disabled={disabled || !connected} onClick={() => run(() => host.profiles.updateRemote(profile.id))}><Icon name="sync" size={17} /></button>}
          </div>)}
          {profiles.length === 0 && <p className={styles.empty}>{t("Empty profiles")}</p>}
        </> : page === "groups" ? <>
          {row(t("URLTest All"), () => run(() => Promise.all(selectable.map((item) => api.urlTest(item.tag)))), "speed", undefined, !running)}
          {selectable.filter((item) => matches(item.tag)).map((item) => <button key={item.tag} type="button" className={styles.row} disabled={disabled || !running} onClick={() => { setGroupTag(item.tag); setPage("nodes"); setSearch(""); }}><span className={styles.rowLabel}>{item.tag}</span><span className={styles.detail}>{item.selected}</span><Icon name="keyboard_arrow_right" size={16} /></button>)}
          {!running && <p className={styles.empty}>{t("Service not started")}</p>}
        </> : group ? <>
          {row(t("URLTest"), () => run(() => api.urlTest(group.tag)), "speed", undefined, !running)}
          {group.items.filter((item) => matches(item.tag)).map((item) => <button type="button" key={item.tag} className={styles.row} role="radio" aria-checked={item.tag === group.selected} disabled={disabled || !running} onClick={() => { if (item.tag !== group.selected) run(() => api.selectOutbound(group.tag, item.tag)); }}>
            <span className={styles.check}>{item.tag === group.selected && <Icon name="check" size={17} />}</span><span className={styles.rowLabel}>{item.tag}</span>
            {item.urlTestDelay > 0 && <span className={styles.delay} data-tone={urlTestDelayTone(item.urlTestDelay)}>{item.urlTestDelay}ms</span>}
          </button>)}
        </> : <p className={styles.empty}>{t("Group unavailable")}</p>}
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.row} onClick={() => open("overview")}><Icon name="open_in_new" size={17} /><span>{t("Open")}</span></button>
        <button type="button" className={styles.row} onClick={host.application.quit} disabled={busy}><Icon name="power_settings_new" size={17} /><span>{t("Quit")}</span></button>
        {busy && <Spinner />}
      </footer>
    </div>
  </div>;
}

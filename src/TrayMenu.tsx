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
import { Spinner } from "./components/ui";
import { ServiceStatus_Type } from "./gen/daemon/started_service_pb";
import { watchStoredValues } from "./lib/storage";
import styles from "./TrayMenu.module.css";

const TRAY_LOCAL_SERVER: Server = { id: "tray-local", name: "MXH Route", url: "", secret: "" };
type Page = "home" | "routing" | "groups" | "nodes" | "profiles" | "more";
interface ItemOptions { icon?: IconName; detail?: string; checked?: boolean; submenu?: boolean; unavailable?: boolean; id?: string }

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
  const menuItems = useRef<HTMLDivElement>(null);
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
  const navigate = (next: Page) => { setPage(next); setSearch(""); };
  const back = () => navigate(page === "nodes" ? "groups" : "home");
  const open = (route: string) => { host.application.showMainWindow(route); host.application.closeTrayMenu(); };
  const run = (action: () => Promise<unknown>, close = false) => {
    if (executing.current) return;
    executing.current = true;
    setBusy(true);
    void action().then(() => { if (close) host.application.closeTrayMenu(); }).catch(showError).finally(() => {
      executing.current = false;
      setBusy(false);
      api.serviceStatus.reconnectNow(); api.groups.reconnectNow(); api.clashMode.reconnectNow();
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
  useEffect(() => {
    const element = panel.current;
    if (!element || !host.application.resizeTrayMenu) return;
    let previous = "";
    const measure = () => {
      const box = getComputedStyle(element);
      let naturalHeight = parseFloat(box.paddingTop) + parseFloat(box.paddingBottom) + parseFloat(box.borderTopWidth) + parseFloat(box.borderBottomWidth);
      // Measure natural list content, not the height currently constrained by
      // the native window. Include both paddings so the last row stays clear.
      for (const child of element.children) {
        if (!(child instanceof HTMLElement)) continue;
        const style = getComputedStyle(child);
        if (style.position === "absolute") continue;
        naturalHeight += (child.hasAttribute("data-menu-body") ? menuItems.current!.getBoundingClientRect().height : child.getBoundingClientRect().height) + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }
      const size = { width: page === "home" || page === "routing" || page === "more" ? 244 : 320, height: Math.max(80, Math.min(760, Math.ceil(naturalHeight) + 12)) };
      const key = `${size.width}:${size.height}`;
      if (key === previous) return;
      previous = key;
      void host.application.resizeTrayMenu!(size).catch(showError);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (menuItems.current) observer.observe(menuItems.current);
    measure();
    return () => observer.disconnect();
  }, [host, page, error]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [page]);

  const item = (label: string, action: () => void, options: ItemOptions = {}) => (
    <button type="button" className={styles.row} role={options.checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={options.checked} aria-haspopup={options.submenu ? "menu" : undefined} title={[label, options.detail].filter(Boolean).join(" · ")}
      data-menu-action={options.id} disabled={disabled || options.unavailable} onClick={action}>
      <span className={styles.mark}>{options.checked ? <Icon name="check" size={15} /> : options.checked === undefined && options.icon ? <Icon name={options.icon} size={15} /> : null}</span>
      <span className={styles.label}>{label}</span>
      {options.detail && <span className={styles.detail}>{options.detail}</span>}
      {options.submenu && <Icon name="keyboard_arrow_right" size={15} />}
    </button>
  );
  const separator = <div className={styles.separator} role="separator" />;
  const modeLabel = (mode: string) => mode.toLowerCase() === "rule" ? t("Rule") : mode.toLowerCase() === "global" ? t("Global") : mode.toLowerCase() === "direct" ? t("Direct") : mode;
  const matches = (name: string) => name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const title = page === "routing" ? t("Routing Mode") : page === "more" ? t("More") : page === "profiles" ? t("Profiles") : page === "nodes" ? group?.tag ?? t("Groups") : t("Groups");
  const searchable = page === "groups" || page === "nodes" || page === "profiles";
  return <div className={styles.viewport} onMouseDown={(event) => { if (event.target === event.currentTarget) host.application.closeTrayMenu(); }}>
    <div ref={panel} className={styles.panel} role="menu" aria-label="MXH Route" data-page={page} onKeyDown={(event) => {
      if (event.key === "Escape" || (event.key === "ArrowLeft" && !(event.target instanceof HTMLInputElement))) { event.preventDefault(); if (page === "home") host.application.closeTrayMenu(); else back(); return; }
      if (event.key === "ArrowRight" && event.target instanceof HTMLButtonElement && event.target.getAttribute("aria-haspopup") === "menu") { event.preventDefault(); event.target.click(); return; }
      if (event.target instanceof HTMLInputElement && event.key !== "Tab" && event.key !== "ArrowDown") return;
      if (!["ArrowDown", "ArrowUp", "Tab"].includes(event.key)) return;
      const items = [...panel.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
      if (!items.length) return;
      const step = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
      const current = items.indexOf(document.activeElement as HTMLElement);
      items[(current + step + items.length) % items.length].focus(); event.preventDefault();
    }}>
      {page !== "home" && <>
        <button type="button" className={styles.row} role="menuitem" aria-label={t("Back")} onClick={back}><span className={styles.mark}><Icon name="arrow_back" size={15} /></span><span className={styles.label}>{title}</span></button>
        {separator}
      </>}
      {error && <div className={styles.error} role="alert"><span title={error}>{error}</span><button type="button" aria-label={t("Ok")} onClick={dismissError}><Icon name="close" size={14} /></button></div>}
      {searchable && <input className={styles.search} type="search" value={search} placeholder={t("Search")} aria-label={t("Search")} onChange={(event) => setSearch(event.target.value)} />}
      <div className={`${styles.body} ${page === "home" ? styles.home : ""}`} data-menu-body><div ref={menuItems}>
        {page === "home" ? <>
          {item(t("Overview"), () => open("overview"), { icon: "open_in_new", id: "open" })}
          {item(busy ? t("Please wait") : status === ServiceStatus_Type.STOPPING ? t("Service stopping...") : transitioning ? t("Service starting...") : started ? t("Stop Service") : t("Start Service"), () => run(() => started ? host.service.stop() : host.service.start(), true), { icon: "power_settings_new", unavailable: !connected || (!started && !selectedId), id: "service" })}
          {separator}
          {item(t("Routing Mode"), () => navigate("routing"), { detail: running ? modeLabel(routing.data.currentMode) : "", submenu: true, unavailable: !running, id: "routing" })}
          {item(t("Groups"), () => navigate("groups"), { submenu: true, unavailable: !running, id: "groups" })}
          {item(t("Profiles"), () => navigate("profiles"), { detail: selected?.name, submenu: true, id: "profiles" })}
          {separator}
          {item(t("System Proxy"), () => { if (captureMode !== "system-proxy") run(() => host.profiles.setCaptureMode("system-proxy"), true); }, { checked: captureMode === "system-proxy", unavailable: !connected, id: "system-proxy" })}
          {item(t("TUN Mode"), () => { if (captureMode !== "tun") run(() => host.profiles.setCaptureMode("tun"), true); }, { checked: captureMode === "tun", unavailable: !connected, id: "tun" })}
          {separator}
          {item(t("Reload profile"), () => run(() => host.service.start(), true), { icon: "sync", unavailable: !running || !selectedId, id: "reload" })}
          {item(t("More"), () => navigate("more"), { submenu: true, id: "more" })}
          {separator}
          {item(t("Quit"), host.application.quit, { icon: "power_settings_new", id: "quit" })}
        </> : page === "routing" ? <>
          {routing.data.modeList.map((mode) => <div key={mode}>{item(modeLabel(mode), () => { if (mode !== routing.data.currentMode) run(() => api.setClashMode(mode), true); }, { checked: mode === routing.data.currentMode, unavailable: !running })}</div>)}
          {!running && <p className={styles.empty}>{t("Service not started")}</p>}
        </> : page === "more" ? <>
          {item(t("Connections"), () => open("connections"), { icon: "swap_vert" })}
          {item(t("Logs"), () => open("logs"), { icon: "terminal" })}
          {item(t("Settings"), () => open("settings"), { icon: "settings" })}
          {host.application.openDataDirectory && item(t("Open data directory"), () => run(() => host.application.openDataDirectory!(), true), { icon: "folder" })}
          {separator}
          {item(t("Close All Connections"), () => run(() => api.closeAllConnections(), true), { icon: "close", unavailable: !running })}
        </> : page === "profiles" ? <>
          {profiles.filter((profile) => matches(profile.name)).map((profile) => <div key={profile.id} className={styles.profile}>
            {item(profile.name, () => { if (profile.id !== selectedId) run(() => host.profiles.select(profile.id), true); }, { checked: profile.id === selectedId, unavailable: !connected })}
            {profile.type === "remote" && <button type="button" className={styles.iconButton} aria-label={`${t("Update")} ${profile.name}`} title={t("Update")} disabled={disabled || !connected} onClick={() => run(() => host.profiles.updateRemote(profile.id))}><Icon name="sync" size={15} /></button>}
          </div>)}
          {profiles.length === 0 && <p className={styles.empty}>{t("Empty profiles")}</p>}
        </> : page === "groups" ? <>
          {item(t("URLTest All"), () => run(() => Promise.all(selectable.map((value) => api.urlTest(value.tag)))), { icon: "speed", unavailable: !running })}
          {separator}
          {selectable.filter((value) => matches(value.tag)).map((value) => <div key={value.tag}>{item(value.tag, () => { setGroupTag(value.tag); navigate("nodes"); }, { detail: value.selected, submenu: true, unavailable: !running })}</div>)}
          {!running && <p className={styles.empty}>{t("Service not started")}</p>}
        </> : group ? <>
          {item(t("URLTest"), () => run(() => api.urlTest(group.tag)), { icon: "speed", unavailable: !running })}
          {separator}
          {group.items.filter((value) => matches(value.tag)).map((value) => <button type="button" key={value.tag} className={styles.row} role="menuitemradio" aria-checked={value.tag === group.selected} title={value.tag} disabled={disabled || !running} onClick={() => { if (value.tag !== group.selected) run(() => api.selectOutbound(group.tag, value.tag), true); }}>
            <span className={styles.mark}>{value.tag === group.selected && <Icon name="check" size={15} />}</span><span className={styles.label}>{value.tag}</span>
            {value.urlTestDelay > 0 && <span className={styles.delay} data-tone={urlTestDelayTone(value.urlTestDelay)}>{value.urlTestDelay}ms</span>}
          </button>)}
        </> : <p className={styles.empty}>{t("Group unavailable")}</p>}
      </div></div>
      {busy && <span className={styles.busy} aria-hidden="true"><Spinner /></span>}
    </div>
  </div>;
}

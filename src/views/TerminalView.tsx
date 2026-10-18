import { lazy, Suspense, type ComponentProps } from "react";

import { useI18n } from "../app/i18n";
import { Icon } from "../components/Icon";
import { EmptyState, IconButton, Spinner } from "../components/ui";
import styles from "./TerminalView.module.css";

// Keep xterm and its adapters out of ordinary dashboard/settings windows.
const Session = lazy(() => import("./TerminalRuntime").then(module => ({ default: module.TailscaleSSHView })));
const Overlay = lazy(() => import("./TerminalRuntime").then(module => ({ default: module.TerminalOverlay })));

function TerminalLoading({ onClose }: { onClose?: () => void }) {
  const { t } = useI18n();
  return <div className="page page-full terminal-page" aria-busy="true">
    <div className="page-header">
      {onClose && <IconButton title={t("Close")} onClick={onClose}><Icon name="close" size={18} /></IconButton>}
      <h1 className="page-title">SSH</h1>
    </div>
    <EmptyState><Spinner /> {t("Loading...")}</EmptyState>
  </div>;
}

export function TailscaleSSHView(props: ComponentProps<typeof import("./TerminalRuntime").TailscaleSSHView>) {
  return <Suspense fallback={<TerminalLoading />}><Session {...props} /></Suspense>;
}

export function TerminalOverlay(props: ComponentProps<typeof import("./TerminalRuntime").TerminalOverlay>) {
  return <Suspense fallback={<div className={styles.terminalOverlay}><TerminalLoading onClose={props.onClose} /></div>}>
    <Overlay {...props} />
  </Suspense>;
}

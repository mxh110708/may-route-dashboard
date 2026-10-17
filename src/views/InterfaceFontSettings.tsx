import { useEffect, useState } from "react";

import type { DesktopHost } from "../app/desktop";
import { showError } from "../app/errorStore";
import { useI18n } from "../app/i18n";
import { loadInterfaceFontPreference, prepareInterfaceFont } from "../app/interfaceFont";
import { Button, Select } from "../components/ui";
import { watchStoredValues } from "../lib/storage";

export function InterfaceFontSettings({ host }: { host: DesktopHost }) {
  const { t } = useI18n();
  const [fonts, setFonts] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState(loadInterfaceFontPreference);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stale = false;
    void host.fonts?.list().then((value) => { if (!stale) setFonts(value); }).catch(showError);
    const unwatch = watchStoredValues(() => setSelected(loadInterfaceFontPreference()));
    return () => { stale = true; unwatch(); };
  }, [host]);
  if (!host.fonts) return null;
  const library = host.fonts;
  const select = async (id: string) => {
    // Chromium must actually decode the font before changing the saved choice.
    await prepareInterfaceFont(id, library);
    await library.select(id);
    setSelected(id);
  };
  const options = [
    { value: "default", label: t("Original interface font") },
    { value: "wenkai", label: t("LXGW WenKai") },
    ...fonts.map((font) => ({ value: font.id, label: font.name })),
  ];
  if (!options.some((option) => option.value === selected)) options.push({ value: selected, label: t("Font unavailable") });
  return (
    <>
      <div className="settings-row">
        <span className="settings-row-label">{t("Interface font")}</span>
        <Select ariaLabel={t("Interface font")} options={options} value={selected} disabled={busy}
          onChange={(id) => {
            setBusy(true);
            void select(id).catch(showError).finally(() => setBusy(false));
          }} />
      </div>
      <div className="settings-row">
        <div className="settings-row-label"><span>{t("Import font")}</span>
          <div className="hint">{t("TTF / OTF, up to 32 MiB. Used only inside this app.")}</div></div>
        <Button disabled={busy} onClick={() => {
          setBusy(true);
          void library.import().then(async (font) => {
            if (!font) return;
            setFonts(await library.list());
            await select(font.id);
          }).catch(showError).finally(() => setBusy(false));
        }}>{busy ? t("Please wait") : t("Import font")}</Button>
      </div>
    </>
  );
}

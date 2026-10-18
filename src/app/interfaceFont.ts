import { useEffect } from "react";

import wenkaiURL from "../assets/fonts/LXGWWenKai-Regular.ttf?url";
import { loadStoredString, watchStoredValues } from "../lib/storage";
import type { DesktopHost } from "./desktop";
import { showError } from "./errorStore";

export const INTERFACE_FONT_KEY = "interface-font";
const DEFAULT_FAMILY = '"Schibsted Grotesk Variable", "Apple Color Emoji", "Noto Color Emoji", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const loadedFonts = new Map<string, Promise<string>>();
const fontFaces = new Map<string, FontFace>();

export function loadInterfaceFontPreference(): string {
  const id = loadStoredString(INTERFACE_FONT_KEY);
  return id === "wenkai" || /^font-[a-f0-9]{64}$/u.test(id ?? "") ? id! : "default";
}

export async function prepareInterfaceFont(id: string, fonts?: DesktopHost["fonts"]): Promise<string> {
  if (id === "default") return DEFAULT_FAMILY;
  if (id !== "wenkai" && !/^font-[a-f0-9]{64}$/u.test(id)) throw new Error("Invalid interface font.");
  let loading = loadedFonts.get(id);
  if (!loading) {
    loading = (async () => {
      const family = id === "wenkai" ? "MXH WenKai" : "MXH-" + id;
      const source = id === "wenkai" ? `url("${wenkaiURL}")` :
        fontDataView(await fonts!.data(id));
      const face = new FontFace(family, source);
      await face.load();
      fontFaces.set(id, face);
      return `"${family}", ${DEFAULT_FAMILY}`;
    })();
    loadedFonts.set(id, loading);
    void loading.catch(() => loadedFonts.delete(id));
  }
  return loading;
}

/** Keep the original view, including its offset; do not copy a 32 MiB font. */
export function fontDataView(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : Uint8Array.from(data);
}

export function discardUnselectedInterfaceFont(id: string): void {
  if (id === loadInterfaceFontPreference()) return;
  const face = fontFaces.get(id);
  if (face) document.fonts.delete(face);
  fontFaces.delete(id);
  loadedFonts.delete(id);
}

export function applyPreparedInterfaceFont(id: string, family: string): void {
  const face = fontFaces.get(id);
  if (face) document.fonts.add(face);
  document.documentElement.style.setProperty("--font-sans", family);
  for (const [key, previous] of fontFaces) {
    if (key === id) continue;
    document.fonts.delete(previous); fontFaces.delete(key); loadedFonts.delete(key);
  }
}

export function useInterfaceTypography(host: DesktopHost | null) {
  useEffect(() => {
    let generation = 0;
    let previous = "";
    const apply = () => {
      const id = loadInterfaceFontPreference();
      if (id === previous) return;
      previous = id;
      const current = ++generation;
      void prepareInterfaceFont(id, host?.fonts).then((family) => {
        if (current !== generation) { discardUnselectedInterfaceFont(id); return; }
        applyPreparedInterfaceFont(id, family);
      }).catch(() => {
        if (current !== generation) { discardUnselectedInterfaceFont(id); return; }
        applyPreparedInterfaceFont("default", DEFAULT_FAMILY);
        showError(new Error("所选字体无法加载，已使用原版字体。可在设置中重新导入或选择内置字体。 / Selected font unavailable; using the original font."));
      });
    };
    apply();
    const unwatch = watchStoredValues(apply);
    return () => { generation++; unwatch(); };
  }, [host]);
}

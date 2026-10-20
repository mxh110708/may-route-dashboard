import { useEffect } from "react";

import wenkaiURL from "../assets/fonts/LXGWWenKai-Regular.ttf?url";
import { loadStoredString, watchStoredValues } from "../lib/storage";
import type { DesktopHost } from "./desktop";
import { showError } from "./errorStore";

export const INTERFACE_FONT_KEY = "interface-font";
const DEFAULT_FAMILY = '"Schibsted Grotesk Variable", "Apple Color Emoji", "Noto Color Emoji", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const loadedFonts = new Map<string, Promise<string>>();
const fontFaces = new Map<string, FontFace[]>();

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
      const family = id === "wenkai" ? "May WenKai" : "May-" + id;
      if (id === "wenkai") {
        const [{ WENKAI_PARTS }, { createBundledInterfaceFont }] = await Promise.all([
          import("../assets/fonts/wenkai/parts"), import("./bundledInterfaceFont"),
        ]);
        const bundle = createBundledInterfaceFont(family, WENKAI_PARTS, wenkaiURL, (face, previous) => {
          if (fontFaces.get(id) !== bundle.faces) return;
          for (const old of previous) document.fonts.delete(old);
          if (loadInterfaceFontPreference() === id) document.fonts.add(face);
        }, showError, () => fontFaces.get(id) === bundle.faces && loadInterfaceFontPreference() === id);
        fontFaces.set(id, bundle.faces);
        try { await bundle.ready; }
        catch (error) { if (fontFaces.get(id) === bundle.faces) fontFaces.delete(id); throw error; }
      } else {
        const face = new FontFace(family, fontDataView(await fonts!.data(id)));
        await face.load();
        fontFaces.set(id, [face]);
      }
      return `"${family}", ${DEFAULT_FAMILY}`;
    })();
    loadedFonts.set(id, loading);
    void loading.catch(() => { if (loadedFonts.get(id) === loading) loadedFonts.delete(id); });
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
  for (const face of fontFaces.get(id) ?? []) document.fonts.delete(face);
  fontFaces.delete(id);
  loadedFonts.delete(id);
}

export function applyPreparedInterfaceFont(id: string, family: string): void {
  for (const face of fontFaces.get(id) ?? []) document.fonts.add(face);
  document.documentElement.style.setProperty("--font-sans", family);
  for (const [key, previous] of fontFaces) {
    if (key === id) continue;
    for (const face of previous) document.fonts.delete(face);
    fontFaces.delete(key); loadedFonts.delete(key);
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

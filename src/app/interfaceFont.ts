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
        Uint8Array.from(await fonts!.data(id)).buffer;
      const face = new FontFace(family, source);
      await face.load();
      document.fonts.add(face);
      fontFaces.set(id, face);
      return `"${family}", ${DEFAULT_FAMILY}`;
    })();
    loadedFonts.set(id, loading);
    void loading.catch(() => loadedFonts.delete(id));
  }
  return loading;
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
        if (current !== generation) return;
        document.documentElement.style.setProperty("--font-sans", family);
        // Retain only the chosen imported/bundled face, rather than keeping
        // every large CJK font ever previewed alive for the renderer's life.
        for (const [key, face] of fontFaces) {
          if (key === id) continue;
          document.fonts.delete(face); fontFaces.delete(key); loadedFonts.delete(key);
        }
      }).catch(() => {
        if (current !== generation) return;
        document.documentElement.style.setProperty("--font-sans", DEFAULT_FAMILY);
        showError(new Error("所选字体无法加载，已使用原版字体。可在设置中重新导入或选择内置字体。 / Selected font unavailable; using the original font."));
      });
    };
    apply();
    const unwatch = watchStoredValues(apply);
    return () => { generation++; unwatch(); };
  }, [host]);
}

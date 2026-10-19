import { loadStoredString, removeStoredValue, saveStoredString } from "../lib/storage";
import type { Language } from "./translations";

export type LanguagePreference = "auto" | Language;

const LANGUAGE_KEY = "language";

export function loadLanguagePreference(): LanguagePreference {
  return normalizeLanguagePreference(loadStoredString(LANGUAGE_KEY));
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  if (value === "en" || value === "zh-Hans") return value;
  if (value === "zh-Hant") return "zh-Hans";
  if (value === "fa" || value === "ru") return "en";
  return "auto";
}

export function saveLanguagePreference(preference: LanguagePreference): void {
  if (preference === "auto") {
    removeStoredValue(LANGUAGE_KEY);
  } else {
    saveStoredString(LANGUAGE_KEY, preference);
  }
}

export function detectSystemLanguage(tags: readonly string[] = navigator.languages ?? [navigator.language]): Language {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (/^zh(?:[-_]|$)/u.test(lower)) return "zh-Hans";
    if (/^en(?:[-_]|$)/u.test(lower)) {
      return "en";
    }
  }
  return "en";
}

export function subscribeSystemLanguage(onChange: () => void): () => void {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

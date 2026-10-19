import { afterEach, describe, expect, it, vi } from "vitest";

import { loadStoredString, removeStoredValue, saveStoredString } from "../lib/storage";
import { detectSystemLanguage, loadLanguagePreference, normalizeLanguagePreference, saveLanguagePreference, subscribeSystemLanguage } from "./i18nCore";
import { translate } from "./i18n";
import { LANGUAGES, TRANSLATIONS } from "./translations";

vi.mock("../lib/storage", () => ({ loadStoredString: vi.fn(), removeStoredValue: vi.fn(), saveStoredString: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("English and Simplified Chinese", () => {
  it("exposes only the two supported languages with complete string catalogs and placeholders", () => {
    expect(LANGUAGES.map(item => item.value)).toEqual(["en", "zh-Hans"]);
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/gu)].map(match => match[1]).sort();
    for (const [key, chinese] of Object.entries(TRANSLATIONS)) {
      expect(typeof chinese, key).toBe("string");
      expect(chinese.length, key).toBeGreaterThan(0);
      expect(placeholders(chinese), key).toEqual(placeholders(key));
    }
    expect(translate("en", "{count} files", { count: 3 })).toBe("3 files");
    expect(translate("zh-Hans", "{count} files", { count: 3 })).toBe("3 个文件");
    expect(translate("zh-Hans", "Current update proxy: {address}", { address: "http://localhost:2080" })).toBe("当前更新代理：http://localhost:2080");
  });

  it("maps old explicit preferences without letting system language change their meaning", () => {
    for (const [saved, expected] of [["zh-Hant", "zh-Hans"], ["fa", "en"], ["ru", "en"], ["en", "en"], ["zh-Hans", "zh-Hans"], [null, "auto"], ["de", "auto"], [42, "auto"]]) {
      expect(normalizeLanguagePreference(saved)).toBe(expected);
    }
    vi.mocked(loadStoredString).mockReturnValue("zh-Hant");
    expect(loadLanguagePreference()).toBe("zh-Hans");
    saveLanguagePreference("zh-Hans");
    expect(saveStoredString).toHaveBeenCalledWith("language", "zh-Hans");
    saveLanguagePreference("auto");
    expect(removeStoredValue).toHaveBeenCalledWith("language");
  });

  it("maps Chinese regions to Simplified Chinese and respects supported browser preference order", () => {
    for (const tag of ["zh", "zh-CN", "zh-SG", "zh-TW", "zh-HK", "zh-MO", "zh-Hant", "ZH_hant_TW"]) {
      expect(detectSystemLanguage([tag, "en-US"]), tag).toBe("zh-Hans");
    }
    expect(detectSystemLanguage(["en-GB", "zh-CN"])).toBe("en");
    expect(detectSystemLanguage(["ru-RU", "fa-IR", "zh-HK"])).toBe("zh-Hans");
    expect(detectSystemLanguage(["ru-RU", "fa-IR", "de-DE"])).toBe("en");
    expect(detectSystemLanguage([])).toBe("en");
  });

  it("retains automatic system changes and cleans up the event listener", () => {
    const target = new EventTarget(), listener = vi.fn();
    vi.stubGlobal("window", target);
    const unsubscribe = subscribeSystemLanguage(listener);
    target.dispatchEvent(new Event("languagechange"));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    target.dispatchEvent(new Event("languagechange"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DesktopHost, DesktopUpdatesState } from "../app/desktop";
import { I18nProvider } from "../app/i18n";
import { configurePreferenceStorage } from "../lib/storage";
import { UpdateDialog } from "./UpdateViews";

configurePreferenceStorage({ get: (name) => name === "language" ? "en" : undefined, set() {}, remove() {}, subscribe: () => () => {} });

const info = { versionName: "1.14.2-may.19", releaseURL: "https://example.com/release", downloadURL: "https://example.com/update.exe", fileSize: 100, releaseNotes: "", isPrerelease: false };
const initial: DesktopUpdatesState = { supported: true, githubTokenSupported: false, trackSelectable: false, track: "stable", checkUpdateEnabled: true, proxyAddress: "", prompted: true, info, checking: false, downloading: false, cancelling: false, installing: false, downloadProgress: 0 };

function render(state: Partial<DesktopUpdatesState>) {
  return renderToStaticMarkup(<I18nProvider><UpdateDialog host={{} as DesktopHost} info={info} state={{ ...initial, ...state }} /></I18nProvider>);
}

describe("update download controls", () => {
  it("keeps cancellation enabled while downloading and shows the saved connection", () => {
    const html = render({ downloading: true, downloadProgress: 0.4, proxyAddress: "http://localhost:2080" });
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>(?:取消下载|Cancel Download)<\/button>/u);
    expect(html).toContain("http://localhost:2080");
    expect(html).toContain('aria-valuenow="40"');
  });
  it("disables repeated cancellation while cleanup is pending", () => {
    expect(render({ downloading: true, cancelling: true })).toMatch(/<button[^>]*disabled[^>]*>(?:正在取消…|Cancelling\.\.\.)<\/button>/u);
  });
  it("does not promise to cancel after installer handoff", () => {
    expect(render({ installing: true })).toMatch(/<button[^>]*disabled[^>]*>(?:取消下载|Cancel Download)<\/button>/u);
  });
  it("makes a blank saved proxy visibly direct, rather than displaying an example as active", () => {
    const html = render({});
    expect(html).toMatch(/尚未设置代理|no proxy configured/u);
    expect(html).not.toContain("127.0.0.1:2080");
  });
});

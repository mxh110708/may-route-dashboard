import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WindowsProxyStatus } from "./WindowsProxyStatus";

describe("Windows system proxy status", () => {
  it("does not invent actual state for older or unsupported hosts", () => {
    expect(renderToStaticMarkup(<WindowsProxyStatus health={undefined} busy={false} />)).toBe("");
    expect(renderToStaticMarkup(<WindowsProxyStatus health="unsupported" busy={false} />)).toBe("");
  });
  it.each(["healthy", "confirming", "repairing", "foreign", "unknown", "inactive"] as const)(
    "%s exposes accessible details without crowding the card", health => {
      const html = renderToStaticMarkup(<WindowsProxyStatus health={health} busy={false} reapply={() => {}} />);
      expect(html).toContain("Windows 系统代理");
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).not.toContain("重新核对并恢复");
      expect(html).not.toContain("已开启，地址匹配 May Route");
    },
  );
  it("keeps suspended state visible even while busy", () => {
    const html = renderToStaticMarkup(<WindowsProxyStatus health="suspended" busy reapply={() => {}} />);
    expect(html).toContain("自动恢复已暂停");
    expect(html).toContain('data-attention="true"');
    expect(html).not.toContain("disabled");
  });
});

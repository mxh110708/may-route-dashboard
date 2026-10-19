import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrioritySummaryContent } from "./PrioritySummaryCard";
import type { DesktopPrioritySummary } from "../app/desktop";

describe("priority overview entry", () => {
  it("is a keyboard accessible details entry, not an immediate policy switch", () => {
    const html = renderToStaticMarkup(<PrioritySummaryContent view={null} failed={false} onOpen={() => {}} />);
    expect(html).toContain('type="button"');
    expect(html).toContain("查看详情与设置");
    expect(html).toContain("正在读取");
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("自动监测中");
  });
  it("does not retain a healthy display on read failure", () => {
    const html = renderToStaticMarkup(<PrioritySummaryContent view={null} failed onOpen={() => {}} />);
    expect(html).toContain("状态读取失败");
    expect(html).not.toContain("自动监测中");
    expect(html).not.toContain("尚未选择入口组");
  });
  it("shows all actual monitored groups and their selected nodes together", () => {
    const view: DesktopPrioritySummary = { settings: { group: "US-West-LA Entry / HK Entry", enabled: true },
      running: true, directMode: false, usageAware: true, activityAvailable: true, active: true,
      selected: "US-West-LA Entry: west-node；HK Entry: hk-node", preferred: "west-node", monitoredSelected: true, needsReload: false,
      activeGroups: [{ group: "US-West-LA Entry", selected: "west-node", preferred: "west-node", monitoredSelected: true },
        { group: "HK Entry", selected: "hk-node", preferred: "hk-node", monitoredSelected: true }] };
    const html = renderToStaticMarkup(<PrioritySummaryContent view={view} failed={false} onOpen={() => {}} />);
    for (const label of ["US-West-LA Entry", "HK Entry", "west-node", "hk-node", "2 个入口监测中"]) expect(html).toContain(label);
  });
});

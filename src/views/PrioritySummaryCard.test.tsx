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
  it("does not offer reload or claim pending edits while runtime initialization is in progress", () => {
    const view: DesktopPrioritySummary = { settings: { group: "", enabled: true }, running: true, directMode: false,
      usageAware: true, activityAvailable: false, active: false, selected: null, preferred: null,
      monitoredSelected: false, needsReload: true, initializing: true, activeGroups: [] };
    const html = renderToStaticMarkup(<PrioritySummaryContent view={view} failed={false} onOpen={() => {}} />);
    expect(html).toContain("正在初始化监测");
    expect(html).not.toContain("需要重载");
    expect(html).not.toContain("有待应用配置");
    const english = renderToStaticMarkup(<PrioritySummaryContent view={view} failed={false} onOpen={() => {}} initializingLabel="Initializing monitoring" />);
    expect(english).toContain("Initializing monitoring");
    expect(english).not.toContain("正在初始化监测");
  });
});

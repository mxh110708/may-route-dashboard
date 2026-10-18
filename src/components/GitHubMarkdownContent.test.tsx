import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GitHubMarkdown } from "./GitHubMarkdownContent";

describe("release notes after deferred loading", () => {
  it("keeps GFM tables, checked items, emoji and safe external links", () => {
    const html = renderToStaticMarkup(<GitHubMarkdown text={"| Feature | Status |\n| --- | --- |\n| Update | Ready |\n\n- [x] Complete :tada:\n\n[release](https://example.com/release)"} />);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>Ready</td>");
    expect(html).toContain('checked=""');
    expect(html).toContain("🎉");
    expect(html).toContain('target="_blank" rel="noreferrer"');
  });

  it("continues to escape raw HTML and preserve code blocks", () => {
    const html = renderToStaticMarkup(<GitHubMarkdown text={"<script>bad()</script>\n\n```sh\necho ready\n```"} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<pre><code class="language-sh">echo ready');
  });
});

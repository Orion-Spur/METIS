import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CouncilRichText from "@/components/CouncilRichText";

describe("CouncilRichText", () => {
  it("renders markdown-style headings and bullet lists as structured markup", () => {
    const html = renderToStaticMarkup(
      <CouncilRichText
        content={"### Key takeaway\n\nA short paragraph.\n\n- First bullet\n- Second bullet with **emphasis**"}
      />,
    );

    expect(html).toContain("Key takeaway");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>First bullet</li>");
    expect(html).toContain("<strong");
    expect(html).not.toContain("### Key takeaway");
  });
});

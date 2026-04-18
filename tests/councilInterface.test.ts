import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CouncilInterface from "@/components/CouncilInterface";

describe("CouncilInterface", () => {
  it("renders the compact pre-session composer without the old helper copy and keeps the live sidebar hidden", () => {
    const html = renderToStaticMarkup(
      React.createElement(CouncilInterface, {
        initialTurns: [],
        initialSessions: [],
        initialUsers: [],
        username: "orion",
        userRole: "user",
      }),
    );

    expect(html).toContain("Brief the council...");
    expect(html).toContain(">Send<");
    expect(html).not.toContain("The transcript behaves like a live room.");
    expect(html).toContain('class="hidden space-y-4"');
  });
});

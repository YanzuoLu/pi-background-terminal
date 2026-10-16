import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { placeStatusOnFirstLine } from "./footer-status.js";

const KEY = "background-terminal";

/** A footer drawn the way Pi's is: the working directory, the stats, then every extension status. */
function footerClass() {
  return class Footer {
    constructor(public footerData: { getExtensionStatuses(): ReadonlyMap<string, string> }) {}

    render(width: number): string[] {
      const statuses = this.footerData.getExtensionStatuses();
      const lines = [truncateToWidth("~/project (main) • session", width, "..."), "stats"];
      if (statuses.size > 0) lines.push([...statuses.values()].join(" "));
      return lines;
    }
  };
}

const withStatuses = (entries: [string, string][]) => ({ getExtensionStatuses: () => new Map(entries) });
const plain = (text: string) => text;
const unstyled = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "");

describe("placeStatusOnFirstLine", () => {
  it("ends the first line with the status instead of giving it a line of its own", () => {
    const Footer = footerClass();
    placeStatusOnFirstLine(Footer, KEY, plain);

    expect(new Footer(withStatuses([[KEY, "bg:2"]])).render(80)).toEqual(["~/project (main) • session • bg:2", "stats"]);
  });

  it("leaves other statuses on their own line, and footers without the status as they were", () => {
    const Footer = footerClass();
    placeStatusOnFirstLine(Footer, KEY, plain);

    expect(new Footer(withStatuses([[KEY, "bg:1"], ["sol-pi", "⚡ saved"]])).render(80)).toEqual([
      "~/project (main) • session • bg:1",
      "stats",
      "⚡ saved",
    ]);
    expect(new Footer(withStatuses([["sol-pi", "⚡ saved"]])).render(80)).toEqual([
      "~/project (main) • session",
      "stats",
      "⚡ saved",
    ]);
  });

  it("shortens the first line to keep the status in a narrow terminal", () => {
    const Footer = footerClass();
    placeStatusOnFirstLine(Footer, KEY, plain);

    const [first] = new Footer(withStatuses([[KEY, "bg:3"]])).render(20);
    expect(unstyled(first!)).toBe("~/project ... • bg:3");
    expect(visibleWidth(first!)).toBeLessThanOrEqual(20);
  });

  it("wraps the footer's own render once when the extension loads again", () => {
    const Footer = footerClass();
    placeStatusOnFirstLine(Footer, KEY, plain);
    placeStatusOnFirstLine(Footer, KEY, plain);

    expect(new Footer(withStatuses([[KEY, "bg:1"]])).render(80)[0]).toBe("~/project (main) • session • bg:1");
  });
});

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** What placing a status needs from Pi's footer component. */
interface Footer {
  footerData: { getExtensionStatuses(): ReadonlyMap<string, string> };
  render(width: number): string[];
}

const ORIGINAL_RENDER = Symbol.for("pi-background-terminal.footer-render");

/**
 * Shows the status set under `key` at the end of the footer's first line, after the working
 * directory and session name and set off with ` • ` as Pi sets off the session name, instead of on the
 * line Pi adds below the footer for extension statuses. That line then appears only for other
 * extensions' statuses. `dim` styles the addition like the rest of the first line. Every footer drawn
 * by `footer` changes, such as the ones pi-side-chat draws for side conversations with Pi's own
 * component.
 */
export function placeStatusOnFirstLine(
  footer: { prototype: object },
  key: string,
  dim: (text: string) => string,
): void {
  const prototype = footer.prototype as Footer & { [ORIGINAL_RENDER]?: Footer["render"] };
  // `/reload` loads this extension again in the same process, so this wraps Pi's render, not an earlier wrapper.
  const render = (prototype[ORIGINAL_RENDER] ??= prototype.render);
  prototype.render = function (this: Footer, width: number): string[] {
    const data = this.footerData;
    const statuses = data.getExtensionStatuses();
    const status = statuses.get(key);
    if (status === undefined) return render.call(this, width);

    const others = new Map([...statuses].filter(([name]) => name !== key));
    this.footerData = Object.create(data, { getExtensionStatuses: { value: () => others } });
    let lines: string[];
    try {
      lines = render.call(this, width);
    } finally {
      this.footerData = data;
    }
    const [first = "", ...rest] = lines;
    const addition = dim(` • ${status}`);
    return [truncateToWidth(first, Math.max(0, width - visibleWidth(addition)), dim("...")) + addition, ...rest];
  };
}

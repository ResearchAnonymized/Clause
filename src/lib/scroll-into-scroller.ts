/** Scroll `el` inside the nearest overflow scroller that actually moves.
 *
 * `scrollIntoView` often no-ops here: `main` has overflow:auto but the
 * evidence pane is the real scroller, so the mark never tracks into view.
 */
export function scrollElementIntoScroller(
  el: Element | null | undefined,
  opts?: { behavior?: ScrollBehavior },
): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const behavior = opts?.behavior ?? "auto";

  let scroller: HTMLElement | null = el.parentElement;
  while (scroller) {
    const oy = window.getComputedStyle(scroller).overflowY;
    const canScroll =
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      scroller.scrollHeight > scroller.clientHeight + 2;
    if (canScroll) break;
    scroller = scroller.parentElement;
  }

  if (!scroller) {
    el.scrollIntoView({ behavior, block: "center", inline: "nearest" });
    return true;
  }

  const er = el.getBoundingClientRect();
  const sr = scroller.getBoundingClientRect();
  const next =
    scroller.scrollTop + (er.top - sr.top) - scroller.clientHeight / 2 + er.height / 2;
  scroller.scrollTo({ top: Math.max(0, next), behavior });
  return true;
}

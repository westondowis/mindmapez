/** CSS variable for the mobile bottom nav height, excluding the safe-area inset. */
export const BOTTOM_NAV_CSS_VAR = "--bottom-nav-h";

/** Fallback nav height (h-16) used before measurement, and as the CSS default under 768px. */
export const BOTTOM_NAV_FALLBACK = "4rem";

/** Air between the last control and the nav (or the home indicator when the nav is hidden). */
export const BOTTOM_CHROME_GAP = "0.75rem";

/** Pixel equivalent of BOTTOM_CHROME_GAP at the default 16px root. */
export const BOTTOM_CHROME_GAP_PX = 12;

/**
 * Bottom padding for scroll containers so the last interactive control clears
 * the fixed bottom nav, the iOS home indicator, and a small gap.
 */
export const CONTENT_BOTTOM_PADDING = `calc(var(${BOTTOM_NAV_CSS_VAR}, 0px) + env(safe-area-inset-bottom, 0px) + ${BOTTOM_CHROME_GAP})`;

/** Bottom offset for floating chrome that should sit just above the nav. Same formula as content padding. */
export const ABOVE_BOTTOM_NAV = CONTENT_BOTTOM_PADDING;

/** Bottom offset for sheets that should rest flush on top of the nav (no extra gap). */
export const CLEAR_BOTTOM_NAV = `calc(var(${BOTTOM_NAV_CSS_VAR}, 0px) + env(safe-area-inset-bottom, 0px))`;

function clampPx(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Pixel padding under scrollable content so the last control clears the fixed bottom nav.
 * `navHeightPx` is the nav bar without its safe-area padding (0 when the nav is hidden).
 */
export function contentBottomPaddingPx(
  navHeightPx: number,
  safeAreaInsetBottomPx: number,
  gapPx: number = BOTTOM_CHROME_GAP_PX,
): number {
  return clampPx(navHeightPx) + clampPx(safeAreaInsetBottomPx) + clampPx(gapPx);
}

/**
 * Value to store in `--bottom-nav-h` from a measured nav box.
 * Subtracts padding-bottom so the CSS padding formula can add
 * `env(safe-area-inset-bottom)` without double-counting it.
 */
export function navHeightVarPx(measuredHeightPx: number, paddingBottomPx: number): number {
  return Math.max(0, clampPx(measuredHeightPx) - clampPx(paddingBottomPx));
}

/** CSS value for `--bottom-nav-h` given a nav's computed box (0 when hidden or missing). */
export function bottomNavCssValue(
  nav: { display: string; height: number; paddingBottom: number } | null,
): string {
  if (!nav || nav.display === "none") return "0px";
  return `${navHeightVarPx(nav.height, nav.paddingBottom)}px`;
}

/** Read the live nav element into the shape `bottomNavCssValue` expects. */
export function readBottomNavBox(el: HTMLElement | null): { display: string; height: number; paddingBottom: number } | null {
  if (!el) return null;
  const style = getComputedStyle(el);
  return {
    display: style.display,
    height: el.getBoundingClientRect().height,
    paddingBottom: Number.parseFloat(style.paddingBottom) || 0,
  };
}

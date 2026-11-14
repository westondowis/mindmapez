import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABOVE_BOTTOM_NAV,
  BOTTOM_CHROME_GAP,
  BOTTOM_CHROME_GAP_PX,
  BOTTOM_NAV_CSS_VAR,
  BOTTOM_NAV_FALLBACK,
  CLEAR_BOTTOM_NAV,
  CONTENT_BOTTOM_PADDING,
  bottomNavCssValue,
  contentBottomPaddingPx,
  navHeightVarPx,
} from "./bottom-chrome.ts";

describe("contentBottomPaddingPx", () => {
  it("adds nav height, the iPhone home-indicator inset, and the gap", () => {
    assert.equal(contentBottomPaddingPx(64, 34), 64 + 34 + BOTTOM_CHROME_GAP_PX);
  });

  it("keeps a gap when the nav is hidden (desktop / tablet), and still honors a safe-area inset", () => {
    assert.equal(contentBottomPaddingPx(0, 0), BOTTOM_CHROME_GAP_PX);
    assert.equal(contentBottomPaddingPx(0, 20), 20 + BOTTOM_CHROME_GAP_PX);
  });

  it("treats non-finite or negative lengths as zero", () => {
    assert.equal(contentBottomPaddingPx(Number.NaN, -10, Number.POSITIVE_INFINITY), 0);
    assert.equal(contentBottomPaddingPx(-4, Number.NaN), BOTTOM_CHROME_GAP_PX);
  });
});

describe("navHeightVarPx / bottomNavCssValue", () => {
  it("strips the nav's padding-bottom so safe-area is not counted twice", () => {
    assert.equal(navHeightVarPx(98, 34), 64);
    assert.equal(navHeightVarPx(64, 0), 64);
    assert.equal(bottomNavCssValue({ display: "flex", height: 98, paddingBottom: 34 }), "64px");
  });

  it("grows with a taller nav (large accessibility text) after subtracting inset padding", () => {
    assert.equal(navHeightVarPx(120, 34), 86);
    assert.equal(bottomNavCssValue({ display: "flex", height: 120, paddingBottom: 34 }), "86px");
  });

  it("is 0 when the nav is missing or display:none (desktop breakpoint)", () => {
    assert.equal(bottomNavCssValue(null), "0px");
    assert.equal(bottomNavCssValue({ display: "none", height: 64, paddingBottom: 34 }), "0px");
    assert.equal(navHeightVarPx(0, 0), 0);
  });
});

describe("CSS padding formula", () => {
  it("is a single calc of the nav variable, the safe-area inset, and the gap", () => {
    assert.equal(
      CONTENT_BOTTOM_PADDING,
      `calc(var(${BOTTOM_NAV_CSS_VAR}, 0px) + env(safe-area-inset-bottom, 0px) + ${BOTTOM_CHROME_GAP})`,
    );
    assert.equal(ABOVE_BOTTOM_NAV, CONTENT_BOTTOM_PADDING);
    assert.equal(CLEAR_BOTTOM_NAV, `calc(var(${BOTTOM_NAV_CSS_VAR}, 0px) + env(safe-area-inset-bottom, 0px))`);
    assert.equal(BOTTOM_NAV_FALLBACK, "4rem");
  });
});

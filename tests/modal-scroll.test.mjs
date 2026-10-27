/**
 * Regression guard for the bottom-sheet scroll contract.
 *
 * Bug history: `.modal-body` had `overflow-y: auto` but was a flex child of a
 * height-capped column without `min-height: 0`, so long lists (18 weapons in
 * the Shop, the voice studio, the leaderboard) were clipped instead of
 * scrolling on phones and inside the Telegram WebView.
 *
 * jsdom cannot compute layout, so this asserts the CSS contract itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.resolve(here, "../web/styles.css"), "utf8");

/** Extract the declaration block of a top-level selector rule. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "m"));
  assert.ok(match, `missing rule for ${selector}`);
  return match[1].replace(/\s+/g, " ").trim();
}

test(".modal-body can shrink and scroll inside the capped sheet", () => {
  const body = rule(".modal-body");
  assert.match(body, /min-height:\s*0/, "min-height:0 lets the flex child shrink");
  assert.match(body, /overflow-y:\s*auto/, "vertical scrolling enabled");
  assert.match(body, /flex:\s*1 1 auto/, "the body takes the remaining height");
  assert.match(body, /overscroll-behavior:\s*contain/, "scroll chaining stopped");
  assert.match(body, /touch-action:\s*pan-y/, "touch dragging allowed inside the WebView");
});

test("the sheet clips to its rounded corners and keeps the header fixed", () => {
  assert.match(rule(".modal"), /overflow:\s*hidden/, "the sheet must clip its content");
  assert.match(rule(".modal-head"), /flex:\s*0 0 auto/, "the header never shrinks");
});

test("tabs wrap instead of overflowing with four entries", () => {
  assert.match(rule(".tabs"), /flex-wrap:\s*wrap/);
});

test("a scroll hint exists for content below the fold", () => {
  assert.match(css, /\.modal\.has-scroll::after/, "fade indicator for more content");
});

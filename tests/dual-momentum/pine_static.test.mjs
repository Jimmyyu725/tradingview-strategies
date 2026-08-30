import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL(
    "../../indicators/spy_qqq_bil_dual_momentum_v1.pine",
    import.meta.url,
  ),
  "utf8",
);

test("declares a signal-only Pine v6 indicator for the fixed universe", () => {
  assert.match(source, /^\/\/@version=6$/m);
  assert.match(source, /indicator\(/);
  assert.doesNotMatch(source, /strategy\./);
  assert.match(source, /AMEX:SPY/);
  assert.match(source, /NASDAQ:QQQ/);
  assert.match(source, /AMEX:BIL/);
});

test("uses only prior completed monthly bars and exposes alerts", () => {
  assert.match(source, /request\.security/);
  assert.match(source, /ticker\.modify/);
  assert.match(source, /adjustment\s*=\s*adjustment\.dividends/);
  assert.match(source, /close\[1\]\s*\/\s*close\[13\]/);
  assert.match(source, /lookahead\s*=\s*barmerge\.lookahead_on/);
  assert.match(source, /timeframe\.change\(\s*"1M"\s*\)/);
  assert.match(source, /alertcondition/);
  assert.doesNotMatch(source, /lookahead_off/);
});

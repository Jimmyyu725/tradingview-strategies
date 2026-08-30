import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../strategies/spy_sma_atr_trend_v1.pine", import.meta.url),
  "utf8",
);

test("declares Pine v6 strategy execution and cost settings", () => {
  assert.match(source, /^\/\/@version=6$/m);
  assert.match(source, /strategy\(\s*"SPY SMA 50\/200 \+ ATR Trend v1"/);
  assert.match(source, /initial_capital\s*=\s*100000(?:\.0)?/);
  assert.match(source, /currency\s*=\s*currency\.USD/);
  assert.match(source, /default_qty_type\s*=\s*strategy\.percent_of_equity/);
  assert.match(source, /default_qty_value\s*=\s*95(?:\.0)?/);
  assert.match(source, /pyramiding\s*=\s*0/);
  assert.match(source, /commission_type\s*=\s*strategy\.commission\.percent/);
  assert.match(source, /commission_value\s*=\s*0\.0011/);
  assert.match(source, /slippage\s*=\s*1/);
  assert.match(source, /process_orders_on_close\s*=\s*false/);
  assert.match(source, /margin_long\s*=\s*100/);
  assert.match(source, /margin_short\s*=\s*100/);
});

test("defines inputs, history validation, and long-only crossover signals", () => {
  assert.match(source, /INITIAL_CAPITAL\s*=\s*100000\.0/);
  assert.match(source, /POSITION_FRACTION\s*=\s*0\.95/);
  assert.match(source, /COMMISSION_PERCENT\s*=\s*0\.0011/);
  assert.match(source, /fastLength\s*=\s*input\.int\(\s*50\b/);
  assert.match(source, /slowLength\s*=\s*input\.int\(\s*200\b/);
  assert.match(source, /atrLength\s*=\s*input\.int\(\s*14\b/);
  assert.match(source, /atrMultiplier\s*=\s*input\.float\(\s*2\.0\b/);
  assert.match(
    source,
    /startDate\s*=\s*input\.time\(\s*timestamp\(\s*"1 Jan 2022 00:00 \+0000"\s*\)/,
  );
  assert.match(source, /syminfo\.ticker\s*!=\s*"SPY"/);
  assert.match(source, /timeframe\.period\s*!=\s*"1D"/);
  assert.match(
    source,
    /runtime\.error\(\s*"This strategy requires SPY on the 1D timeframe\."\s*\)/,
  );
  assert.match(source, /preStartBarCount\s*<\s*slowLength/);
  assert.match(
    source,
    /runtime\.error\(\s*"At least 200 pre-start daily bars are required\."\s*\)/,
  );
  assert.match(source, /ta\.crossover\(\s*fastSma\s*,\s*slowSma\s*\)/);
  assert.match(source, /ta\.crossunder\(\s*fastSma\s*,\s*slowSma\s*\)/);
  assert.match(
    source,
    /strategy\.entry\(\s*"Long"\s*,\s*strategy\.long\s*\)/,
  );
  assert.doesNotMatch(source, /strategy\.short/);
});

test("attaches an initial ATR stop and only raises the trailing stop", () => {
  assert.match(
    source,
    /strategy\.exit\(\s*"ATR Stop"\s*,\s*"Long"\s*,\s*loss\s*=\s*initialStopTicks\s*\)/,
  );
  assert.match(
    source,
    /candidateStop\s*=\s*close\s*-\s*atrMultiplier\s*\*\s*atr/,
  );
  assert.match(
    source,
    /trailStop\s*:=\s*na\(\s*trailStop\s*\)\s*\?\s*math\.max\(\s*initialStop\s*,\s*candidateStop\s*\)\s*:\s*math\.max\(\s*trailStop\s*,\s*candidateStop\s*\)/,
  );
  assert.match(
    source,
    /strategy\.exit\(\s*"ATR Stop"\s*,\s*"Long"\s*,\s*stop\s*=\s*trailStop\s*\)/,
  );
  assert.match(source, /stopRegressionCount\s*\+=\s*1/);
});

test("cancels the ATR stop before closing on a death cross", () => {
  assert.match(
    source,
    /strategy\.cancel\(\s*"ATR Stop"\s*\)[\s\S]*strategy\.close\(\s*"Long"\s*,\s*comment\s*=\s*"Death Cross"\s*\)/,
  );
});

test("avoids lookahead and intrabar recalculation", () => {
  assert.doesNotMatch(source, /request\.security/);
  assert.doesNotMatch(source, /lookahead/);
  assert.match(source, /calc_on_order_fills\s*=\s*false/);
  assert.match(source, /calc_on_every_tick\s*=\s*false/);
});

test("renders the four evidence metrics in a bottom-right table", () => {
  assert.match(
    source,
    /table\.new\(\s*position\.bottom_right\s*,\s*2\s*,\s*5\b/,
  );
  assert.match(source, /"Metric"/);
  assert.match(source, /"Value"/);
  assert.match(source, /"Strategy equity return"/);
  assert.match(source, /"Buy & hold return"/);
  assert.match(source, /"Excess return"/);
  assert.match(source, /"Stop regressions"/);
});

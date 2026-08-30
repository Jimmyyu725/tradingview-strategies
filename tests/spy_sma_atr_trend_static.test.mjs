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
  assert.match(
    source,
    /slowLength\s*=\s*input\.int\(\s*200\b[^\n]*minval\s*=\s*2\b/,
  );
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
  assert.match(
    source,
    /if\s+time\s*<\s*startDate\s+preStartBarCount\s*\+=\s*1/,
  );
  assert.equal(
    [...source.matchAll(/preStartBarCount\s*\+=\s*1/g)].length,
    1,
  );
  assert.match(
    source,
    /indicatorsReady\s*=\s*not\s+na\(\s*fastSma\s*\)\s*and\s*not\s+na\(\s*slowSma\s*\)\s*and\s*not\s+na\(\s*atr\s*\)/,
  );
  assert.match(source, /inBacktest\s*=\s*time\s*>=\s*startDate/);
  assert.match(
    source,
    /crossedAbove\s*=\s*ta\.crossover\(\s*fastSma\s*,\s*slowSma\s*\)/,
  );
  assert.match(
    source,
    /crossedBelow\s*=\s*ta\.crossunder\(\s*fastSma\s*,\s*slowSma\s*\)/,
  );
  assert.match(
    source,
    /goldenCross\s*=\s*inBacktest\s*and\s*indicatorsReady\s*and\s*crossedAbove/,
  );
  assert.match(
    source,
    /deathCross\s*=\s*inBacktest\s*and\s*indicatorsReady\s*and\s*crossedBelow/,
  );
  assert.match(
    source,
    /strategy\.entry\(\s*"Long"\s*,\s*strategy\.long\s*\)/,
  );
  assert.doesNotMatch(source, /strategy\.short/);
});

test("attaches an initial ATR stop and only raises the trailing stop", () => {
  assert.match(source, /entryAtr\s*:=\s*atr/);
  assert.match(
    source,
    /stopDistance\s*=\s*atrMultiplier\s*\*\s*(?:entryAtr|atr)\b/,
  );
  assert.match(
    source,
    /initialStopTicks\s*=\s*math\.max\(\s*1\s*,\s*int\(\s*math\.ceil\(\s*stopDistance\s*\/\s*syminfo\.mintick\s*\)\s*\)\s*\)/,
  );
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
    /initialStop\s*=\s*strategy\.position_avg_price\s*-\s*atrMultiplier\s*\*\s*entryAtr/,
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
  assert.match(
    source,
    /if\s+not\s+na\(\s*previousStop\s*\)\s*and\s*trailStop\s*<\s*previousStop\s+stopRegressionCount\s*\+=\s*1/,
  );
  assert.match(
    source,
    /if\s+strategy\.position_size\s*==\s*0\s*and\s*strategy\.position_size\[1\]\s*>\s*0\s+entryAtr\s*:=\s*na\s+trailStop\s*:=\s*na/,
  );
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

test("computes and renders the benchmark, returns, plots, and evidence table", () => {
  assert.match(
    source,
    /benchmarkEntryPrice\s*:=\s*close\s*\+\s*syminfo\.mintick/,
  );
  assert.match(
    source,
    /commissionRate\s*=\s*COMMISSION_PERCENT\s*\/\s*100\.0/,
  );
  assert.match(
    source,
    /benchmarkDeployedCapital\s*=\s*INITIAL_CAPITAL\s*\*\s*POSITION_FRACTION/,
  );
  assert.match(
    source,
    /benchmarkCash\s*=\s*INITIAL_CAPITAL\s*\*\s*\(\s*1\.0\s*-\s*POSITION_FRACTION\s*\)/,
  );
  assert.match(
    source,
    /benchmarkEntryCommission\s*=\s*benchmarkDeployedCapital\s*\*\s*commissionRate/,
  );
  assert.match(
    source,
    /benchmarkExitPrice\s*=\s*[^\n]*close\s*-\s*syminfo\.mintick/,
  );
  assert.match(
    source,
    /benchmarkExitCommission\s*=\s*[^\n]*benchmarkExitNotional\s*\*\s*commissionRate/,
  );
  assert.match(
    source,
    /benchmarkEquity\s*=\s*[^\n]*benchmarkCash\s*\+\s*benchmarkExitNotional\s*-\s*benchmarkEntryCommission\s*-\s*benchmarkExitCommission/,
  );
  assert.match(
    source,
    /benchmarkReturn\s*=\s*[^\n]*\(\s*benchmarkEquity\s*\/\s*INITIAL_CAPITAL\s*-\s*1\.0\s*\)\s*\*\s*100\.0/,
  );
  assert.match(
    source,
    /strategyEquityReturn\s*=\s*\(\s*strategy\.equity\s*\/\s*INITIAL_CAPITAL\s*-\s*1\.0\s*\)\s*\*\s*100\.0/,
  );
  assert.match(
    source,
    /excessReturn\s*=\s*[^\n]*strategyEquityReturn\s*-\s*benchmarkReturn/,
  );
  assert.match(source, /plot\(\s*fastSma\s*,\s*"Fast SMA"/);
  assert.match(source, /plot\(\s*slowSma\s*,\s*"Slow SMA"/);
  assert.match(
    source,
    /plot\(\s*strategy\.position_size\s*>\s*0\s*\?\s*trailStop\s*:\s*na\s*,\s*"ATR Stop"/,
  );
  assert.match(source, /plotshape\(\s*goldenCross\b/);
  assert.match(source, /plotshape\(\s*deathCross\b/);
  assert.match(
    source,
    /bgcolor\(\s*time\s*<\s*startDate\s*\?\s*color\.new\(\s*color\.gray\s*,\s*90\s*\)\s*:\s*na/,
  );
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

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
  assert.match(source, /const\s+int\s+MIN_PRESTART_BARS\s*=\s*200\b/);
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
  assert.match(
    source,
    /if\s+barstate\.isfirst\s+and\s+\(\s*ticker\.standard\(\s*syminfo\.tickerid\s*\)\s*!=\s*"AMEX:SPY"\s+or\s+not\s+chart\.is_standard\s+or\s+timeframe\.period\s*!=\s*"1D"\s*\)\s+runtime\.error\(\s*"This strategy requires SPY on the 1D timeframe\."\s*\)/,
  );
  assert.match(source, /preStartBarCount\s*<\s*MIN_PRESTART_BARS/);
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
  const exitResetIndex = source.search(
    /if\s+strategy\.position_size\s*==\s*0\s*and\s*strategy\.position_size\[1\]\s*>\s*0/,
  );
  const goldenCrossEntryIndex = source.search(
    /if\s+goldenCross\s+and\s+strategy\.position_size\s*==\s*0/,
  );
  assert.ok(exitResetIndex >= 0, "exit reset block must exist");
  assert.ok(goldenCrossEntryIndex >= 0, "golden-cross entry block must exist");
  assert.ok(
    exitResetIndex < goldenCrossEntryIndex,
    "exit reset must run before a same-bar golden-cross entry",
  );
});

test("cancels the ATR stop before closing on a death cross", () => {
  assert.match(
    source,
    /^if[ \t]+strategy\.position_size[ \t]*>[ \t]*0[ \t]+and[ \t]+deathCross[ \t]*\r?\n([ \t]+)strategy\.cancel\([ \t]*"ATR Stop"[ \t]*\)[ \t]*\r?\n\1strategy\.close\([ \t]*"Long"[ \t]*,[ \t]*comment[ \t]*=[ \t]*"Death Cross"[ \t]*\)/m,
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
    /if\s+inBacktest\s+and\s+na\(\s*benchmarkEntryPrice\s*\)\s+benchmarkEntryPrice\s*:=\s*close\s*\+\s*syminfo\.mintick/,
  );
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
    /benchmarkRawShares\s*=\s*[^\n]*benchmarkDeployedCapital\s*\/\s*benchmarkEntryPrice/,
  );
  assert.match(
    source,
    /benchmarkShares\s*=\s*[^\n]*math\.floor\(\s*benchmarkRawShares\s*\/\s*syminfo\.mincontract\s*\)\s*\*\s*syminfo\.mincontract/,
  );
  assert.match(
    source,
    /benchmarkEntryNotional\s*=\s*[^\n]*benchmarkShares\s*\*\s*benchmarkEntryPrice/,
  );
  assert.match(
    source,
    /benchmarkEntryCommission\s*=\s*[^\n]*benchmarkEntryNotional\s*\*\s*commissionRate/,
  );
  assert.match(
    source,
    /benchmarkCash\s*=\s*[^\n]*INITIAL_CAPITAL\s*-\s*benchmarkEntryNotional\s*-\s*benchmarkEntryCommission/,
  );
  assert.match(
    source,
    /benchmarkExitPrice\s*=\s*[^\n]*close\s*-\s*syminfo\.mintick/,
  );
  assert.match(
    source,
    /benchmarkExitNotional\s*=\s*[^\n]*benchmarkShares\s*\*\s*benchmarkExitPrice/,
  );
  assert.match(
    source,
    /benchmarkExitCommission\s*=\s*[^\n]*benchmarkExitNotional\s*\*\s*commissionRate/,
  );
  assert.match(
    source,
    /benchmarkEquity\s*=\s*[^\n]*benchmarkCash\s*\+\s*benchmarkExitNotional\s*-\s*benchmarkExitCommission/,
  );
  assert.match(
    source,
    /benchmarkReturn\s*=\s*[^\n]*\(\s*benchmarkEquity\s*\/\s*INITIAL_CAPITAL\s*-\s*1\.0\s*\)\s*\*\s*100\.0/,
  );
  assert.match(
    source,
    /hypotheticalExitPrice\s*=\s*math\.max\(\s*syminfo\.mintick\s*,\s*close\s*-\s*syminfo\.mintick\s*\)/,
  );
  assert.match(
    source,
    /hypotheticalExitSlippage\s*=\s*strategy\.position_size\s*>\s*0\s*\?\s*strategy\.position_size\s*\*\s*\(\s*close\s*-\s*hypotheticalExitPrice\s*\)\s*:\s*0\.0/,
  );
  assert.match(
    source,
    /hypotheticalExitCommission\s*=\s*strategy\.position_size\s*>\s*0\s*\?\s*strategy\.position_size\s*\*\s*hypotheticalExitPrice\s*\*\s*commissionRate\s*:\s*0\.0/,
  );
  assert.match(
    source,
    /strategyLiquidatedEquity\s*=\s*strategy\.position_size\s*>\s*0\s*\?\s*strategy\.equity\s*-\s*hypotheticalExitSlippage\s*-\s*hypotheticalExitCommission\s*:\s*strategy\.equity/,
  );
  assert.match(
    source,
    /strategyEquityReturn\s*=\s*\(\s*strategyLiquidatedEquity\s*\/\s*INITIAL_CAPITAL\s*-\s*1\.0\s*\)\s*\*\s*100\.0/,
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
  assert.match(
    source,
    /table\.cell\(\s*evidenceTable\s*,\s*1\s*,\s*1\s*,\s*str\.tostring\(\s*strategyEquityReturn\b/,
  );
  assert.match(
    source,
    /table\.cell\(\s*evidenceTable\s*,\s*1\s*,\s*2\s*,\s*str\.tostring\(\s*benchmarkReturn\b/,
  );
  assert.match(
    source,
    /table\.cell\(\s*evidenceTable\s*,\s*1\s*,\s*3\s*,\s*str\.tostring\(\s*excessReturn\b/,
  );
  assert.match(
    source,
    /table\.cell\(\s*evidenceTable\s*,\s*1\s*,\s*4\s*,\s*str\.tostring\(\s*stopRegressionCount\s*\)\s*\)/,
  );
});

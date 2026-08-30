import test from "node:test";
import assert from "node:assert/strict";

import {
  COST_PROFILE_NAMES,
  DATA_START,
  DEVELOPMENT_EVALUATION_START,
  DEVELOPMENT_END,
  EVALUATION_START,
  INITIAL_CAPITAL,
  MAX_DATA_AGE_CALENDAR_DAYS,
  POSITION_FRACTION,
  SYMBOLS,
  TICK_SIZE,
} from "../../src/dual-momentum/config.mjs";

test("freezes the approved symbols, dates, capital, and costs", () => {
  assert.deepEqual(SYMBOLS, {
    SPY: { yahoo: "SPY", tradingview: "AMEX:SPY" },
    QQQ: { yahoo: "QQQ", tradingview: "NASDAQ:QQQ" },
    BIL: { yahoo: "BIL", tradingview: "AMEX:BIL" },
  });
  assert.equal(DATA_START, "2008-01-01");
  assert.equal(DEVELOPMENT_EVALUATION_START, "2009-02-02");
  assert.equal(DEVELOPMENT_END, "2021-12-31");
  assert.equal(EVALUATION_START, "2022-01-03");
  assert.equal(INITIAL_CAPITAL, 100_000);
  assert.equal(MAX_DATA_AGE_CALENDAR_DAYS, 4);
  assert.equal(POSITION_FRACTION, 0.95);
  assert.equal(TICK_SIZE, 0.01);
  assert.deepEqual(COST_PROFILE_NAMES, [
    "zero_cost",
    "webull_current",
    "robinhood_current",
  ]);
  assert.ok(Object.isFrozen(SYMBOLS));
});

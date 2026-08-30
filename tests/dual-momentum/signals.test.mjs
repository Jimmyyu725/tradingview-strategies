import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDualMomentumSignals,
  buildMonthlySmaSignals,
  buildSma200Signals,
} from "../../src/dual-momentum/signals.mjs";

function monthly(symbol, values) {
  return {
    symbol,
    bars: values.map((value, index) => ({
      date: String(2020 + Math.floor(index / 12)) + "-" +
        String((index % 12) + 1).padStart(2, "0") + "-28",
      adjustedClose: value,
    })),
  };
}

test("chooses relative winner only when it beats BIL and resolves ties to SPY", () => {
  const yahoo = {
    SPY: monthly("SPY", [...Array(12).fill(100), 110, 111]),
    QQQ: monthly("QQQ", [...Array(12).fill(100), 110, 112]),
    BIL: monthly("BIL", [...Array(12).fill(100), 105, 113]),
  };
  const signals = buildDualMomentumSignals(yahoo);
  assert.equal(signals[0].target, "SPY");
  assert.equal(signals[1].target, "BIL");
  assert.equal(signals[0].values.lookbackMonths, 12);
});

test("uses only completed observations for fixed SMA controls", () => {
  const daily = Array.from({ length: 202 }, (_, index) => ({
    date: new Date(Date.UTC(2021, 0, index + 1)).toISOString().slice(0, 10),
    adjustedClose: index < 200 ? 100 : 101,
  }));
  const sma200 = buildSma200Signals({ bars: daily });
  assert.equal(sma200.at(-1).target, "SPY");

  const monthlySeries = monthly("SPY", [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11]);
  assert.equal(buildMonthlySmaSignals(monthlySeries).at(-1).target, "SPY");
});

test("does not change an old signal when future prices change", () => {
  const base = {
    SPY: monthly("SPY", [...Array(13).fill(100), 110]),
    QQQ: monthly("QQQ", [...Array(13).fill(100), 105]),
    BIL: monthly("BIL", [...Array(13).fill(100), 101]),
  };
  const before = buildDualMomentumSignals(base)[0];
  base.QQQ.bars.push({ date: "2022-03-28", adjustedClose: 1_000 });
  const after = buildDualMomentumSignals(base)[0];
  assert.deepEqual(after, before);
});

test("rejects a missing calendar month instead of shortening the lookback", () => {
  const broken = {
    SPY: monthly("SPY", Array(14).fill(100)),
    QQQ: monthly("QQQ", Array(14).fill(100)),
    BIL: monthly("BIL", Array(14).fill(100)),
  };
  for (const series of Object.values(broken)) series.bars.splice(5, 1);
  assert.throws(() => buildDualMomentumSignals(broken), /12 calendar months/);
});

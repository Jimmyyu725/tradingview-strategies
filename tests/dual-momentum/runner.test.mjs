import test from "node:test";
import assert from "node:assert/strict";

import { runDualMomentumBacktest } from "../../scripts/run_dual_momentum_backtest.mjs";

function syntheticSeries(symbol, multiplier) {
  const bars = [];
  const cursor = new Date("2008-01-01T00:00:00Z");
  const end = new Date("2022-06-30T00:00:00Z");
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const month = (cursor.getUTCFullYear() - 2008) * 12 + cursor.getUTCMonth();
      const price = 100 * multiplier + month * multiplier;
      bars.push({
        date: cursor.toISOString().slice(0, 10),
        open: price, high: price, low: price, close: price,
        adjustedOpen: price, adjustedHigh: price, adjustedLow: price,
        adjustedClose: price, factor: 1, dividend: 0, splitRatio: 1,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { symbol, bars };
}

test("runs every strategy and profile from one frozen data bundle", async () => {
  let published = null;
  const yahoo = {
    SPY: syntheticSeries("SPY", 1),
    QQQ: syntheticSeries("QQQ", 1.2),
    BIL: syntheticSeries("BIL", 0.9),
  };
  const tradingview = Object.fromEntries(
    Object.entries(yahoo).map(([symbol, series]) => [
      symbol,
      series.bars.map((bar) => ({ date: bar.date, close: bar.close })),
    ]),
  );
  const result = await runDualMomentumBacktest({
    now: () => new Date("2022-06-30T22:00:00Z"),
    loadYahoo: async () => ({
      normalized: yahoo,
      rawSources: Object.fromEntries(
        Object.keys(yahoo).map((symbol) => [
          symbol, { url: "fixture:" + symbol, payload: { symbol } },
        ]),
      ),
    }),
    loadTradingView: async () => tradingview,
    publish: (bundle) => {
      published = bundle;
      return { directory: "/tmp/test-report" };
    },
  });
  assert.equal(result.output.directory, "/tmp/test-report");
  assert.deepEqual(Object.keys(published.strategies), [
    "dual_momentum", "sma_200", "sma_10m", "spy_buy_hold",
  ]);
  assert.deepEqual(Object.keys(published.strategies.dual_momentum), [
    "zero_cost", "webull_current", "robinhood_current",
  ]);
  assert.equal(published.developmentSanity.selectionUsed, false);
  assert.deepEqual(published.developmentSanity.period, {
    start: "2009-02-02",
    end: "2021-12-31",
  });
  assert.match(published.qualification.status, /PASS|FAIL/);
  assert.ok(published.signals.dual_momentum.length > 0);
});

test("publishes UNVERIFIED for a data-quality mismatch but not for fetch failure", async () => {
  let diagnostic = null;
  const base = {
    now: () => new Date("2022-06-30T22:00:00Z"),
    loadYahoo: async () => { throw new Error("network down"); },
    loadTradingView: async () => ({}),
    publish: (bundle) => { diagnostic = bundle; return {}; },
  };
  await assert.rejects(() => runDualMomentumBacktest(base), /network down/);
  assert.equal(diagnostic, null);

  const yahoo = {
    SPY: syntheticSeries("SPY", 1),
    QQQ: syntheticSeries("QQQ", 1.2),
    BIL: syntheticSeries("BIL", 0.9),
  };
  const tradingview = Object.fromEntries(
    Object.entries(yahoo).map(([symbol, series]) => [
      symbol,
      series.bars.map((bar) => ({ date: bar.date, close: bar.close })),
    ]),
  );
  tradingview.SPY[0].close *= 2;
  const result = await runDualMomentumBacktest({
    now: () => new Date("2022-06-30T22:00:00Z"),
    loadYahoo: async () => ({
      normalized: yahoo,
      rawSources: Object.fromEntries(Object.keys(yahoo).map((symbol) => [
        symbol, { url: "fixture:" + symbol, payload: { symbol } },
      ])),
    }),
    loadTradingView: async () => tradingview,
    publish: (bundle) => {
      diagnostic = bundle;
      return { directory: "/tmp/unverified" };
    },
  });
  assert.equal(result.bundle.qualification.status, "UNVERIFIED");
  assert.match(result.bundle.quality.error, /TradingView close mismatch/);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDataManifest,
  validateDataBundle,
} from "../../src/dual-momentum/data.mjs";
import { loadTradingViewBars } from "../../src/dual-momentum/tradingview.mjs";

function series(symbol, closes) {
  return {
    symbol,
    bars: closes.map((close, index) => ({
      date: ["2022-01-03", "2022-01-04"][index],
      open: close,
      high: close,
      low: close,
      close,
      adjustedClose: close,
      adjustedOpen: close,
      adjustedHigh: close,
      adjustedLow: close,
      factor: 1,
      dividend: 0,
      splitRatio: 1,
    })),
  };
}

test("accepts aligned data and records a deterministic manifest", () => {
  const yahoo = {
    SPY: series("SPY", [100, 101]),
    QQQ: series("QQQ", [200, 202]),
    BIL: series("BIL", [90, 90.1]),
  };
  const tradingview = {
    SPY: [{ date: "2022-01-03", close: 100 }, { date: "2022-01-04", close: 101 }],
    QQQ: [{ date: "2022-01-03", close: 200 }, { date: "2022-01-04", close: 202 }],
    BIL: [{ date: "2022-01-03", close: 90 }, { date: "2022-01-04", close: 90.1 }],
  };
  const quality = validateDataBundle({
    yahoo,
    tradingview,
    now: new Date("2022-01-05T00:00:00Z"),
    requiredStart: "2022-01-01",
  });
  assert.equal(quality.verified, true);
  assert.equal(quality.latestCommonDate, "2022-01-04");
  assert.equal(quality.tradingView.SPY.rowCount, 2);
  const manifest = buildDataManifest(
    { SPY: { payload: { a: 1 }, url: "x" } },
    { SPY: yahoo.SPY },
    new Date("2022-01-05T00:00:00Z"),
  );
  assert.match(manifest.sources.SPY.sha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.sources.SPY.rowCount, 2);
  assert.equal(manifest.sources.SPY.earliestDate, "2022-01-03");
  assert.equal(manifest.sources.SPY.latestDate, "2022-01-04");
});

test("fails closed on stale or non-finite TradingView data", () => {
  const yahoo = {
    SPY: series("SPY", [100, 101]),
    QQQ: series("QQQ", [200, 202]),
    BIL: series("BIL", [90, 90.1]),
  };
  const tradingview = Object.fromEntries(
    Object.entries(yahoo).map(([symbol, value]) => [
      symbol,
      value.bars.map((bar) => ({ date: bar.date, close: bar.close })),
    ]),
  );
  const malformed = structuredClone(tradingview);
  malformed.SPY[0].close = Number.NaN;
  assert.throws(
    () => validateDataBundle({
      yahoo,
      tradingview: malformed,
      now: new Date("2022-01-05T00:00:00Z"),
      requiredStart: "2022-01-01",
    }),
    /TradingView contains invalid close/,
  );
  assert.throws(
    () => validateDataBundle({
      yahoo,
      tradingview,
      now: new Date("2022-01-10T00:00:00Z"),
      requiredStart: "2022-01-01",
    }),
    /latest common date is stale/,
  );
  assert.throws(
    () => validateDataBundle({
      yahoo,
      tradingview,
      now: new Date("2022-01-05T00:00:00Z"),
      requiredStart: "2021-01-01",
    }),
    /warm-up coverage/,
  );
});

test("fails closed on a missing common day or a cross-source mismatch", () => {
  const aligned = {
    SPY: series("SPY", [100, 101]),
    QQQ: series("QQQ", [200, 202]),
    BIL: series("BIL", [90, 90.1]),
  };
  const missing = structuredClone(aligned);
  missing.BIL.bars.pop();
  assert.throws(
    () => validateDataBundle({
      yahoo: missing,
      tradingview: {},
      now: new Date("2022-01-05T00:00:00Z"),
      requiredStart: "2022-01-01",
    }),
    /common trading calendar/,
  );
  assert.throws(
    () => validateDataBundle({
      yahoo: aligned,
      tradingview: {
        SPY: [{ date: "2022-01-03", close: 102 }],
        QQQ: [],
        BIL: [],
      },
      now: new Date("2022-01-05T00:00:00Z"),
      requiredStart: "2022-01-01",
    }),
    /TradingView close mismatch/,
  );
});

test("loads TradingView symbols sequentially and validates responses", async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args.join(" "));
    if (args[0] === "ui") {
      const ticker = calls.some((call) => call === "symbol NASDAQ:QQQ")
        ? "BATS:QQQ"
        : "BATS:SPY";
      return {
        success: true,
        result: {
          actualSymbol: ticker,
          resolution: "D",
          seriesLoaded: true,
          symbolInfo: true,
        },
      };
    }
    if (args[0] === "ohlcv") {
      return {
        success: true,
        bars: [{ time: Date.parse("2022-01-03T00:00:00Z") / 1000, close: 100 }],
      };
    }
    return { success: true };
  };
  const bars = await loadTradingViewBars(
    { SPY: "AMEX:SPY", QQQ: "NASDAQ:QQQ" },
    run,
  );
  assert.deepEqual(Object.keys(bars), ["SPY", "QQQ"]);
  assert.deepEqual(calls.map((call) => call.startsWith("ui eval ")
    ? "ui eval"
    : call), [
    "symbol AMEX:SPY",
    "timeframe 1D",
    "ui eval",
    "ohlcv --count 5000",
    "ui eval",
    "symbol NASDAQ:QQQ",
    "timeframe 1D",
    "ui eval",
    "ohlcv --count 5000",
    "ui eval",
  ]);
});

test("rejects stale TradingView bars when the requested series is not loaded", async () => {
  const run = async (args) => {
    if (args[0] === "ui") {
      return {
        success: true,
        result: {
          actualSymbol: "NASDAQ:QQQ",
          resolution: "D",
          seriesLoaded: false,
          symbolInfo: false,
        },
      };
    }
    if (args[0] === "ohlcv") {
      return {
        success: true,
        bars: [{ time: Date.parse("2022-01-03T00:00:00Z") / 1000, close: 100 }],
      };
    }
    return { success: true, chart_ready: false };
  };

  await assert.rejects(
    () => loadTradingViewBars({ QQQ: "NASDAQ:QQQ" }, run),
    /TradingView NASDAQ:QQQ series is not loaded/,
  );
});

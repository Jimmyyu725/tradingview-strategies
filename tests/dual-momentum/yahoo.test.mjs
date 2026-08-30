import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchYahooChart,
  normalizeYahooSeries,
  parseYahooChart,
  reconstructTotalReturn,
  retainCompletedSessions,
} from "../../src/dual-momentum/yahoo.mjs";

const timestamps = [
  Date.parse("2021-12-30T14:30:00Z") / 1000,
  Date.parse("2021-12-31T14:30:00Z") / 1000,
  Date.parse("2022-01-03T14:30:00Z") / 1000,
];

const payload = {
  chart: {
    error: null,
    result: [{
      meta: { symbol: "SPY", exchangeTimezoneName: "America/New_York" },
      timestamp: timestamps,
      indicators: {
        quote: [{
          open: [99, 98, 100],
          high: [101, 100, 102],
          low: [98, 97, 99],
          close: [100, 99, 101],
          volume: [10, 11, 12],
        }],
        adjclose: [{ adjclose: [99, 99, 101] }],
      },
      events: {
        dividends: {
          d1: { date: timestamps[1], amount: 1 },
        },
      },
    }],
  },
};

test("parses Yahoo rows and applies adjusted-close factors to OHLC", () => {
  const parsed = parseYahooChart(payload, "SPY");
  const normalized = normalizeYahooSeries(parsed);
  assert.equal(normalized.bars[0].date, "2021-12-30");
  assert.equal(normalized.bars[0].factor, 0.99);
  assert.equal(normalized.bars[0].adjustedOpen, 98.01);
  assert.equal(normalized.bars[1].dividend, 1);
  assert.equal(normalized.bars[2].adjustedClose, 101);
});

test("reconstructs the same total return from raw close and dividends", () => {
  const normalized = normalizeYahooSeries(parseYahooChart(payload, "SPY"));
  const rebuilt = reconstructTotalReturn(normalized.bars);
  assert.equal(rebuilt[0].index, 1);
  assert.equal(rebuilt[1].index, 1);
  assert.ok(Math.abs(rebuilt[2].index - 101 / 99) < 1e-12);
});

test("handles a two-for-one split without a false loss", () => {
  const bars = [
    { date: "2020-01-01", close: 100, dividend: 0, splitRatio: 1 },
    { date: "2020-01-02", close: 50, dividend: 0, splitRatio: 2 },
  ];
  assert.deepEqual(reconstructTotalReturn(bars).map((row) => row.index), [1, 1]);
});

test("excludes the current New York session until its close is final", () => {
  const normalized = normalizeYahooSeries(parseYahooChart(payload, "SPY"));
  assert.equal(
    retainCompletedSessions(
      normalized,
      new Date("2022-01-03T19:00:00Z"),
    ).bars.at(-1).date,
    "2021-12-31",
  );
  assert.equal(
    retainCompletedSessions(
      normalized,
      new Date("2022-01-03T22:00:00Z"),
    ).bars.at(-1).date,
    "2022-01-03",
  );
});

test("rejects missing adjusted prices and failed HTTP responses", async () => {
  const broken = structuredClone(payload);
  broken.chart.result[0].indicators.adjclose[0].adjclose[1] = null;
  assert.throws(() => parseYahooChart(broken, "SPY"), /finite OHLC/);

  await assert.rejects(
    () => fetchYahooChart("SPY", {
      start: "2020-01-01",
      endExclusive: "2020-02-01",
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    /Yahoo SPY request failed with HTTP 429/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import { COST_PROFILES } from "../../src/dual-momentum/costs.mjs";
import { backtestPortfolio } from "../../src/dual-momentum/portfolio.mjs";

const dates = ["2021-12-31", "2022-01-03", "2022-01-04", "2022-02-01"];

function asset(symbol, opens, closes) {
  return {
    symbol,
    bars: dates.map((date, index) => ({
      date,
      adjustedOpen: opens[index],
      adjustedClose: closes[index],
    })),
  };
}

const seriesBySymbol = {
  SPY: asset("SPY", [100, 100, 100, 120], [100, 100, 120, 120]),
  QQQ: asset("QQQ", [200, 200, 200, 240], [200, 200, 240, 240]),
  BIL: asset("BIL", [90, 90, 90, 90], [90, 90, 90, 90]),
};

test("executes a month-end target on the next trading-day open", () => {
  const result = backtestPortfolio({
    seriesBySymbol,
    signals: [{ signalDate: "2021-12-31", target: "SPY" }],
    costProfile: COST_PROFILES.zero_cost,
  });
  assert.deepEqual(result.trades.map((trade) => [trade.date, trade.side]), [
    ["2022-01-03", "buy"],
  ]);
  assert.equal(result.trades[0].shares, 950);
  assert.equal(result.daily[0].cash, 5_000);
  assert.equal(result.daily[0].equity, 100_000);
});

test("does not rebalance an unchanged target after exposure drifts above 95%", () => {
  const result = backtestPortfolio({
    seriesBySymbol,
    signals: [
      { signalDate: "2021-12-31", target: "SPY" },
      { signalDate: "2022-01-03", target: "SPY" },
    ],
    costProfile: COST_PROFILES.zero_cost,
  });
  assert.equal(result.trades.length, 1);
  assert.ok(result.daily[1].exposure > 0.95);
});

test("sells before buying a changed target and preserves non-negative cash", () => {
  const result = backtestPortfolio({
    seriesBySymbol,
    signals: [
      { signalDate: "2021-12-31", target: "SPY" },
      { signalDate: "2022-01-04", target: "QQQ" },
    ],
    costProfile: COST_PROFILES.webull_current,
  });
  assert.deepEqual(result.trades.slice(-2).map((trade) => trade.side), [
    "sell", "buy",
  ]);
  assert.ok(result.daily.every((row) => row.cash >= 0));
  assert.ok(result.trades.at(-1).targetFraction <= 0.95 + 1e-12);
});

test("rejects unknown assets and a non-common signal date", () => {
  assert.throws(
    () => backtestPortfolio({
      seriesBySymbol,
      signals: [{ signalDate: "2021-12-31", target: "BTC" }],
      costProfile: COST_PROFILES.zero_cost,
    }),
    /Unknown target BTC/,
  );
});

test("honors a frozen end date for the development sanity window", () => {
  const result = backtestPortfolio({
    seriesBySymbol,
    signals: [{ signalDate: "2021-12-31", target: "SPY" }],
    costProfile: COST_PROFILES.zero_cost,
    endDate: "2022-01-04",
  });
  assert.equal(result.daily.at(-1).date, "2022-01-04");
});

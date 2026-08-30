import test from "node:test";
import assert from "node:assert/strict";

import {
  computeMetrics,
  evaluateQualification,
  independentReturnAndDrawdown,
} from "../../src/dual-momentum/metrics.mjs";

const daily = [
  { date: "2022-01-03", equity: 120, tradesNotional: 0 },
  { date: "2022-01-04", equity: 90, tradesNotional: 0 },
  { date: "2022-01-05", equity: 110, tradesNotional: 0 },
];

test("computes return and peak-to-trough maximum drawdown from initial equity", () => {
  const metrics = computeMetrics({ initialCapital: 100, daily, trades: [] });
  assert.ok(Math.abs(metrics.totalReturn - 0.1) < 1e-12);
  assert.ok(Math.abs(metrics.maxDrawdown - (-0.25)) < 1e-12);
  assert.equal(metrics.drawdownPeakDate, "2022-01-03");
  assert.equal(metrics.drawdownTroughDate, "2022-01-04");
  assert.equal(metrics.drawdownRecoveryDate, null);
  assert.ok(Math.abs(metrics.annualReturns["2022"] - 0.1) < 1e-12);
});

test("independent calculation matches the primary return and drawdown", () => {
  const primary = computeMetrics({ initialCapital: 100, daily, trades: [] });
  const independent = independentReturnAndDrawdown(100, daily);
  assert.ok(Math.abs(primary.totalReturn - independent.totalReturn) < 1e-12);
  assert.ok(Math.abs(primary.maxDrawdown - independent.maxDrawdown) < 1e-12);
});

test("passes only when both broker profiles beat SPY without worse drawdown", () => {
  const strategy = {
    webull_current: { totalReturn: 0.3, maxDrawdown: -0.1 },
    robinhood_current: { totalReturn: 0.29, maxDrawdown: -0.1 },
  };
  const benchmark = {
    webull_current: { totalReturn: 0.2, maxDrawdown: -0.2 },
    robinhood_current: { totalReturn: 0.2, maxDrawdown: -0.2 },
  };
  assert.equal(evaluateQualification({ strategy, benchmark, dataVerified: true })
    .status, "PASS");
  strategy.robinhood_current.totalReturn = 0.2;
  assert.equal(evaluateQualification({ strategy, benchmark, dataVerified: true })
    .status, "FAIL");
  assert.equal(evaluateQualification({ strategy, benchmark, dataVerified: false })
    .status, "UNVERIFIED");
});

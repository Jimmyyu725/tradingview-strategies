import test from "node:test";
import assert from "node:assert/strict";

import {
  COST_PROFILES,
  calculateOrderCosts,
} from "../../src/dual-momentum/costs.mjs";

test("zero cost charges nothing and has no slippage", () => {
  assert.deepEqual(
    calculateOrderCosts(COST_PROFILES.zero_cost, {
      side: "buy", shares: 100, rawPrice: 500,
    }),
    {
      executionPrice: 500,
      notional: 50_000,
      sec: 0,
      taf: 0,
      cat: 0,
      totalFees: 0,
      slippage: 0,
    },
  );
});

test("applies current Webull sell fees and one adverse tick", () => {
  const costs = calculateOrderCosts(COST_PROFILES.webull_current, {
    side: "sell", shares: 100, rawPrice: 500,
  });
  assert.equal(costs.executionPrice, 499.99);
  assert.equal(costs.taf, 0.0195);
  assert.equal(costs.sec, costs.notional * 0.0000206);
  assert.ok(Math.abs(costs.cat - 0.0003) < 1e-12);
  assert.ok(Math.abs(costs.slippage - 1) < 1e-12);
});

test("applies Robinhood exemptions and cent rounding", () => {
  const exempt = calculateOrderCosts(COST_PROFILES.robinhood_current, {
    side: "sell", shares: 50, rawPrice: 10,
  });
  assert.equal(exempt.sec, 0);
  assert.equal(exempt.taf, 0);

  const charged = calculateOrderCosts(COST_PROFILES.robinhood_current, {
    side: "sell", shares: 100, rawPrice: 100,
  });
  assert.equal(charged.sec, 0.21);
  assert.equal(charged.taf, 0.02);
  assert.equal(charged.cat, 0);
});

test("rejects invalid side, shares, or price", () => {
  assert.throws(
    () => calculateOrderCosts(COST_PROFILES.zero_cost, {
      side: "short", shares: 1, rawPrice: 1,
    }),
    /side must be buy or sell/,
  );
});

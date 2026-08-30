import { TICK_SIZE } from "./config.mjs";

export const COST_PROFILES = Object.freeze({
  zero_cost: Object.freeze({
    name: "zero_cost",
    tick: 0,
    webull: false,
    robinhood: false,
  }),
  webull_current: Object.freeze({
    name: "webull_current",
    tick: TICK_SIZE,
    webull: true,
    robinhood: false,
    secRate: 0.0000206,
    tafRate: 0.000195,
    tafMin: 0.01,
    tafMax: 9.79,
    catRate: 0.000003,
    secEffectiveDate: "2026-04-04",
    tafEffectiveDate: "2026-01-01",
    observedDate: "2026-08-30",
    sourceUrl: "https://www.webull.com/pricing",
  }),
  robinhood_current: Object.freeze({
    name: "robinhood_current",
    tick: TICK_SIZE,
    webull: false,
    robinhood: true,
    secRate: 0.0000206,
    secExemptNotional: 500,
    tafRate: 0.000195,
    tafExemptShares: 50,
    tafMax: 9.79,
    catRate: 0,
    secEffectiveDate: "2026-04-04",
    tafEffectiveDate: "2026-01-01",
    observedDate: "2026-08-30",
    sourceUrl:
      "https://robinhood.com/us/en/support/articles/trading-fees-on-robinhood/",
  }),
});

function roundCent(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ceilCent(value) {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

export function calculateOrderCosts(profile, { side, shares, rawPrice }) {
  if (side !== "buy" && side !== "sell") {
    throw new Error("Order side must be buy or sell.");
  }
  if (!Number.isFinite(shares) || shares <= 0 ||
      !Number.isFinite(rawPrice) || rawPrice <= 0) {
    throw new Error("Order shares and price must be finite and positive.");
  }
  const executionPrice = rawPrice + (side === "buy" ? profile.tick : -profile.tick);
  if (executionPrice <= 0) throw new Error("Slipped execution price is invalid.");
  const notional = shares * executionPrice;
  const slippage = shares * Math.abs(executionPrice - rawPrice);
  let sec = 0;
  let taf = 0;
  let cat = 0;
  if (profile.webull) {
    cat = shares * profile.catRate;
    if (side === "sell") {
      sec = notional * profile.secRate;
      if (executionPrice >= profile.tafRate) {
        taf = Math.min(profile.tafMax, Math.max(profile.tafMin, shares * profile.tafRate));
      }
    }
  }
  if (profile.robinhood && side === "sell") {
    if (notional > profile.secExemptNotional) {
      sec = ceilCent(notional * profile.secRate);
    }
    if (shares > profile.tafExemptShares) {
      taf = Math.min(profile.tafMax, roundCent(shares * profile.tafRate));
    }
  }
  return {
    executionPrice,
    notional,
    sec,
    taf,
    cat,
    totalFees: sec + taf + cat,
    slippage,
  };
}

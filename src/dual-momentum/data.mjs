import { createHash } from "node:crypto";

import {
  DATA_START,
  MAX_DATA_AGE_CALENDAR_DAYS,
  TOTAL_RETURN_TOLERANCE,
  TRADINGVIEW_CLOSE_TOLERANCE,
} from "./config.mjs";
import { reconstructTotalReturn } from "./yahoo.mjs";

export class DataQualityError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "DataQualityError";
  }
}

function monthKey(date) {
  return date.slice(0, 7);
}

function monthlyLast(rows, field) {
  const output = new Map();
  for (const row of rows) output.set(monthKey(row.date), row[field]);
  return output;
}

function validateBars(name, bars) {
  if (!Array.isArray(bars) || bars.length === 0) {
    throw new Error(name + " has no rows.");
  }
  let previous = "";
  for (const bar of bars) {
    if (bar.date <= previous) throw new Error(name + " dates must increase.");
    for (const field of [
      "open", "high", "low", "close", "adjustedOpen", "adjustedHigh",
      "adjustedLow", "adjustedClose", "factor",
    ]) {
      if (!Number.isFinite(bar[field]) || bar[field] <= 0) {
        throw new Error(name + " contains invalid " + field + ".");
      }
    }
    if (bar.low > bar.high || bar.open < bar.low || bar.open > bar.high ||
        bar.close < bar.low || bar.close > bar.high) {
      throw new Error(name + " contains invalid OHLC relationships.");
    }
    previous = bar.date;
  }
}

function compareReconstruction(name, bars) {
  const rebuilt = monthlyLast(reconstructTotalReturn(bars), "index");
  const firstAdjusted = bars[0].adjustedClose;
  const adjusted = monthlyLast(
    bars.map((bar) => ({
      date: bar.date,
      index: bar.adjustedClose / firstAdjusted,
    })),
    "index",
  );
  for (const [month, value] of adjusted) {
    const other = rebuilt.get(month);
    if (!Number.isFinite(other) ||
        Math.abs(value / other - 1) > TOTAL_RETURN_TOLERANCE) {
      throw new Error(name + " total-return reconstruction mismatch in " + month + ".");
    }
  }
}

function compareTradingView(name, yahooBars, tradingViewBars) {
  if (!Array.isArray(tradingViewBars) || tradingViewBars.length === 0) {
    throw new Error(name + " TradingView cross-check is missing.");
  }
  let previous = "";
  for (const bar of tradingViewBars) {
    if (bar.date <= previous) {
      throw new Error(name + " TradingView dates must increase.");
    }
    if (!Number.isFinite(bar.close) || bar.close <= 0) {
      throw new Error(name + " TradingView contains invalid close.");
    }
    previous = bar.date;
  }
  const yahoo = new Map(yahooBars.map((bar) => [bar.date, bar.close]));
  const tradingViewDates = new Set(tradingViewBars.map((bar) => bar.date));
  const firstTradingViewDate = tradingViewBars[0].date;
  const lastTradingViewDate = tradingViewBars.at(-1).date;
  for (const bar of yahooBars) {
    if (bar.date >= firstTradingViewDate && bar.date <= lastTradingViewDate &&
        !tradingViewDates.has(bar.date)) {
      throw new Error(name + " TradingView calendar is missing " + bar.date + ".");
    }
  }
  for (const bar of tradingViewBars) {
    if (!yahoo.has(bar.date)) continue;
    const difference = Math.abs(yahoo.get(bar.date) / bar.close - 1);
    if (difference > TRADINGVIEW_CLOSE_TOLERANCE) {
      throw new Error(name + " TradingView close mismatch on " + bar.date + ".");
    }
  }
  if (tradingViewBars.at(-1).date !== yahooBars.at(-1).date) {
    throw new Error(name + " TradingView latest complete date does not match Yahoo.");
  }
}

function validateFreshness(latestDate, now) {
  const today = now.toISOString().slice(0, 10);
  const age = (Date.parse(today + "T00:00:00Z") -
    Date.parse(latestDate + "T00:00:00Z")) / 86_400_000;
  if (!Number.isFinite(age) || age < 0 || age > MAX_DATA_AGE_CALENDAR_DAYS) {
    throw new Error("The latest common date is stale or in the future.");
  }
}

function validateWarmupCoverage(earliestDate, requiredStart) {
  const lag = (Date.parse(earliestDate + "T00:00:00Z") -
    Date.parse(requiredStart + "T00:00:00Z")) / 86_400_000;
  if (!Number.isFinite(lag) || lag < 0 || lag > 7) {
    throw new Error("Yahoo warm-up coverage does not match the requested start.");
  }
}

export function validateDataBundle({
  yahoo,
  tradingview,
  now = new Date(),
  requiredStart = DATA_START,
}) {
  try {
    const names = ["SPY", "QQQ", "BIL"];
    const calendars = names.map((name) => {
      validateBars(name, yahoo[name]?.bars);
      compareReconstruction(name, yahoo[name].bars);
      return yahoo[name].bars.map((bar) => bar.date);
    });
    const expected = calendars[0].join(",");
    if (calendars.some((calendar) => calendar.join(",") !== expected)) {
      throw new Error("Yahoo series do not share one common trading calendar.");
    }
    validateWarmupCoverage(calendars[0][0], requiredStart);
    validateFreshness(calendars[0].at(-1), now);
    for (const name of names) {
      compareTradingView(name, yahoo[name].bars, tradingview[name]);
    }
    return {
      verified: true,
      earliestCommonDate: calendars[0][0],
      latestCommonDate: calendars[0].at(-1),
      rowCount: calendars[0].length,
      tradingView: Object.fromEntries(names.map((name) => [
        name,
        {
          ticker: name === "QQQ" ? "NASDAQ:QQQ" : "AMEX:" + name,
          rowCount: tradingview[name].length,
          earliestDate: tradingview[name][0].date,
          latestDate: tradingview[name].at(-1).date,
        },
      ])),
    };
  } catch (error) {
    if (error instanceof DataQualityError) throw error;
    throw new DataQualityError(error.message, { cause: error });
  }
}

export function buildDataManifest(
  rawSources,
  normalized,
  generatedAt = new Date(),
) {
  const sources = {};
  for (const [symbol, source] of Object.entries(rawSources)) {
    const serialized = JSON.stringify(source.payload);
    const bars = normalized[symbol].bars;
    sources[symbol] = {
      url: source.url,
      bytes: Buffer.byteLength(serialized),
      sha256: createHash("sha256").update(serialized).digest("hex"),
      rowCount: bars.length,
      earliestDate: bars[0].date,
      latestDate: bars.at(-1).date,
    };
  }
  return { generatedAt: generatedAt.toISOString(), sources };
}

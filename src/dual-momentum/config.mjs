export const SYMBOLS = Object.freeze({
  SPY: Object.freeze({ yahoo: "SPY", tradingview: "AMEX:SPY" }),
  QQQ: Object.freeze({ yahoo: "QQQ", tradingview: "NASDAQ:QQQ" }),
  BIL: Object.freeze({ yahoo: "BIL", tradingview: "AMEX:BIL" }),
});

export const DATA_START = "2008-01-01";
// 2008 is warm-up data for the first exact 12-calendar-month signal.
export const DEVELOPMENT_EVALUATION_START = "2009-02-02";
export const DEVELOPMENT_END = "2021-12-31";
export const EVALUATION_START = "2022-01-03";
export const INITIAL_CAPITAL = 100_000;
export const POSITION_FRACTION = 0.95;
export const TICK_SIZE = 0.01;
export const LOOKBACK_MONTHS = 12;
export const DAILY_SMA_LENGTH = 200;
export const MONTHLY_SMA_LENGTH = 10;
export const MAX_DATA_AGE_CALENDAR_DAYS = 4;
export const TOTAL_RETURN_TOLERANCE = 0.001;
export const TRADINGVIEW_CLOSE_TOLERANCE = 0.0025;
export const COST_PROFILE_NAMES = Object.freeze([
  "zero_cost",
  "webull_current",
  "robinhood_current",
]);

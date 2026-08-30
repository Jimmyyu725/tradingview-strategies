import { retainCompletedSessions } from "./yahoo.mjs";

function requireSuccess(result, action) {
  if (result?.success !== true) {
    throw new Error(action + " failed: " + (result?.error ?? "unknown error"));
  }
  return result;
}

function dateFromTimestamp(value) {
  const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid TradingView time.");
  return date.toISOString().slice(0, 10);
}

export async function loadTradingViewBars(
  symbols,
  run,
  { now = new Date() } = {},
) {
  const output = {};
  for (const [key, ticker] of Object.entries(symbols)) {
    requireSuccess(await run(["symbol", ticker]), "Set " + ticker);
    requireSuccess(await run(["timeframe", "1D"]), "Set daily timeframe");
    const response = requireSuccess(
      await run(["ohlcv", "--count", "5000"]),
      "Load " + ticker + " OHLCV",
    );
    if (!Array.isArray(response.bars) || response.bars.length === 0) {
      throw new Error("TradingView " + ticker + " returned no bars.");
    }
    const parsed = response.bars.map((bar) => ({
      date: dateFromTimestamp(bar.time),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
    }));
    output[key] = retainCompletedSessions({ symbol: key, bars: parsed }, now).bars;
  }
  return output;
}

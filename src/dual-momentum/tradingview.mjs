import { retainCompletedSessions } from "./yahoo.mjs";

const SERIES_STATE_EXPRESSION = [
  "(function(){",
  "var chart=window.TradingViewApi._activeChartWidgetWV.value();",
  "var series=chart._chartWidget.model().mainSeries();",
  "return {",
  "actualSymbol:String(series.actualSymbol()),",
  "resolution:String(chart.resolution()),",
  "seriesLoaded:Boolean(series.seriesLoaded()),",
  "symbolInfo:Boolean(series.symbolInfo())",
  "};",
  "})()",
].join("");

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

function bareSymbol(value) {
  return String(value ?? "").split(":").at(-1).toUpperCase();
}

async function verifySeriesState(run, ticker) {
  const response = requireSuccess(
    await run(["ui", "eval", SERIES_STATE_EXPRESSION]),
    "Inspect " + ticker + " series",
  );
  const state = response.result;
  if (bareSymbol(state?.actualSymbol) !== bareSymbol(ticker)) {
    throw new Error(
      "TradingView " + ticker + " resolved to " +
      (state?.actualSymbol ?? "an unknown symbol") + ".",
    );
  }
  if (state?.resolution !== "D" && state?.resolution !== "1D") {
    throw new Error(
      "TradingView " + ticker + " did not resolve to a daily series.",
    );
  }
  if (state?.seriesLoaded !== true || state?.symbolInfo !== true) {
    throw new Error("TradingView " + ticker + " series is not loaded.");
  }
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
    await verifySeriesState(run, ticker);
    const response = requireSuccess(
      await run(["ohlcv", "--count", "5000"]),
      "Load " + ticker + " OHLCV",
    );
    await verifySeriesState(run, ticker);
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

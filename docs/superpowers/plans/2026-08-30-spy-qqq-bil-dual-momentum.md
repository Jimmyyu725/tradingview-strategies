# SPY、QQQ 与 BIL 双动量样本外回测实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 构建一套无杠杆、只做多、可复现的 SPY/QQQ/BIL 双动量组合回测，并严格判断其在 2022 年至今扣除成本后是否同时在收益和最大回撤上优于 SPY。

**Architecture:** 使用 Node.js 内置模块构建五层流水线：Yahoo 数据适配与复权、TradingView 独立交叉检查、纯函数信号、组合账户回放、结构化指标与原子报告。策略规则和成功门槛固定在配置中；2022 年后的结果只能被读取和报告，不能反向改变规则。

**Tech Stack:** Node.js 24、ES modules、node:test、内置 fetch/crypto/fs、Pine Script v6、TradingView MCP CLI。

---

## 文件结构

- Create: <code>src/dual-momentum/config.mjs</code> — 冻结标的、日期、资金、摩擦和门禁常量。
- Create: <code>src/dual-momentum/yahoo.mjs</code> — 下载、解析和标准化 Yahoo 日线及公司行动。
- Create: <code>src/dual-momentum/tradingview.mjs</code> — 顺序读取 TradingView 三标的日线。
- Create: <code>src/dual-momentum/data.mjs</code> — 共同日历、复权复算、跨源比较和数据清单。
- Create: <code>src/dual-momentum/signals.mjs</code> — 双动量、200 日均线和 10 月均线目标信号。
- Create: <code>src/dual-momentum/costs.mjs</code> — 零成本、Webull 和 Robinhood 当前费率。
- Create: <code>src/dual-momentum/portfolio.mjs</code> — 下一交易日开盘换仓和每日权益回放。
- Create: <code>src/dual-momentum/metrics.mjs</code> — 收益、回撤、风险指标和 PASS/FAIL 门禁。
- Create: <code>src/dual-momentum/report.mjs</code> — JSON/CSV/Markdown/HTML 和目录级原子发布。
- Create: <code>src/dual-momentum/verify.mjs</code> — 与主指标实现独立的收益和回撤复算。
- Create: <code>scripts/run_dual_momentum_backtest.mjs</code> — 依赖注入式编排和命令行入口。
- Create: <code>scripts/verify_dual_momentum_report.mjs</code> — 从落盘 CSV 独立验证 JSON 指标。
- Create: <code>indicators/spy_qqq_bil_dual_momentum_v1.pine</code> — 非重绘 TradingView 伴随指标。
- Create: <code>tests/dual-momentum/*.test.mjs</code> — 每个边界对应一个测试文件。
- Modify: <code>package.json</code> — 增加专项测试和回测命令。
- Modify: <code>.gitignore</code> — 忽略原始行情缓存和临时发布目录。

### Task 1: 冻结项目契约与命令

**Files:**
- Create: <code>src/dual-momentum/config.mjs</code>
- Create: <code>tests/dual-momentum/config.test.mjs</code>
- Modify: <code>package.json</code>
- Modify: <code>.gitignore</code>

- [ ] **Step 1: 写入失败的配置契约测试**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";

import {
  COST_PROFILE_NAMES,
  DATA_START,
  DEVELOPMENT_EVALUATION_START,
  DEVELOPMENT_END,
  EVALUATION_START,
  INITIAL_CAPITAL,
  MAX_DATA_AGE_CALENDAR_DAYS,
  POSITION_FRACTION,
  SYMBOLS,
  TICK_SIZE,
} from "../../src/dual-momentum/config.mjs";

test("freezes the approved symbols, dates, capital, and costs", () => {
  assert.deepEqual(SYMBOLS, {
    SPY: { yahoo: "SPY", tradingview: "AMEX:SPY" },
    QQQ: { yahoo: "QQQ", tradingview: "NASDAQ:QQQ" },
    BIL: { yahoo: "BIL", tradingview: "AMEX:BIL" },
  });
  assert.equal(DATA_START, "2008-01-01");
  assert.equal(DEVELOPMENT_EVALUATION_START, "2009-02-02");
  assert.equal(DEVELOPMENT_END, "2021-12-31");
  assert.equal(EVALUATION_START, "2022-01-03");
  assert.equal(INITIAL_CAPITAL, 100_000);
  assert.equal(MAX_DATA_AGE_CALENDAR_DAYS, 4);
  assert.equal(POSITION_FRACTION, 0.95);
  assert.equal(TICK_SIZE, 0.01);
  assert.deepEqual(COST_PROFILE_NAMES, [
    "zero_cost",
    "webull_current",
    "robinhood_current",
  ]);
  assert.ok(Object.isFrozen(SYMBOLS));
});
~~~

- [ ] **Step 2: 运行测试并确认模块尚不存在**

Run: <code>node --test tests/dual-momentum/config.test.mjs</code>

Expected: FAIL，错误包含 <code>ERR_MODULE_NOT_FOUND</code> 和 <code>src/dual-momentum/config.mjs</code>。

- [ ] **Step 3: 实现冻结配置**

~~~javascript
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
~~~

- [ ] **Step 4: 接入 npm 命令和缓存忽略规则**

把 <code>package.json</code> 的 scripts 改为：

~~~json
{
  "scripts": {
    "test": "node --test tests/*.test.mjs tests/dual-momentum/*.test.mjs",
    "test:pine": "node --test tests/spy_sma_atr_trend_static.test.mjs",
    "test:report": "node --test tests/run_tradingview_backtest.test.mjs",
    "test:dual-momentum": "node --test tests/dual-momentum/*.test.mjs"
  }
}
~~~

在 <code>.gitignore</code> 末尾增加：

~~~gitignore
data/cache/
docs/backtests/.dual-momentum-*.tmp/
docs/backtests/.dual-momentum-*.backup/
~~~

- [ ] **Step 5: 运行配置测试**

Run: <code>node --test tests/dual-momentum/config.test.mjs</code>

Expected: PASS，1 test，0 fail。

- [ ] **Step 6: 提交契约**

~~~bash
git add .gitignore package.json src/dual-momentum/config.mjs tests/dual-momentum/config.test.mjs
git commit -m "test: freeze dual-momentum project contract"
~~~

### Task 2: Yahoo 行情、复权和公司行动

**Files:**
- Create: <code>src/dual-momentum/yahoo.mjs</code>
- Create: <code>tests/dual-momentum/yahoo.test.mjs</code>

- [ ] **Step 1: 写解析、复权和总回报复算测试**

~~~javascript
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
~~~

- [ ] **Step 2: 运行 Yahoo 测试并确认失败**

Run: <code>node --test tests/dual-momentum/yahoo.test.mjs</code>

Expected: FAIL，错误为 <code>ERR_MODULE_NOT_FOUND</code>。

- [ ] **Step 3: 实现下载与严格解析**

~~~javascript
function isoDate(seconds) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Yahoo timestamp.");
  return date.toISOString().slice(0, 10);
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(label + " must contain finite OHLC values.");
  }
  return value;
}

export async function fetchYahooChart(
  symbol,
  { start, endExclusive, fetchImpl = fetch } = {},
) {
  const period1 = Math.floor(Date.parse(start + "T00:00:00Z") / 1000);
  const period2 = Math.floor(Date.parse(endExclusive + "T00:00:00Z") / 1000);
  if (!Number.isFinite(period1) || !Number.isFinite(period2) || period2 <= period1) {
    throw new Error("Yahoo date range is invalid.");
  }
  const url = new URL(
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol),
  );
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "true");
  const response = await fetchImpl(url, {
    headers: { "user-agent": "tradingview-strategies/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      "Yahoo " + symbol + " request failed with HTTP " + response.status + ".",
    );
  }
  return { url: url.toString(), payload: await response.json() };
}

export function parseYahooChart(payload, expectedSymbol) {
  if (payload?.chart?.error) {
    throw new Error("Yahoo " + expectedSymbol + " error: " +
      JSON.stringify(payload.chart.error));
  }
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
  const timestamps = result?.timestamp;
  if (result?.meta?.symbol !== expectedSymbol || !Array.isArray(timestamps)) {
    throw new Error("Yahoo " + expectedSymbol + " response identity is invalid.");
  }
  const dividends = new Map(
    Object.values(result.events?.dividends ?? {}).map((event) => [
      isoDate(event.date),
      Number(event.amount),
    ]),
  );
  const splits = new Map(
    Object.values(result.events?.splits ?? {}).map((event) => [
      isoDate(event.date),
      Number(event.numerator) / Number(event.denominator),
    ]),
  );
  const bars = timestamps.map((timestamp, index) => {
    const date = isoDate(timestamp);
    return {
      date,
      time: timestamp,
      open: finitePositive(quote?.open?.[index], "Yahoo " + expectedSymbol),
      high: finitePositive(quote?.high?.[index], "Yahoo " + expectedSymbol),
      low: finitePositive(quote?.low?.[index], "Yahoo " + expectedSymbol),
      close: finitePositive(quote?.close?.[index], "Yahoo " + expectedSymbol),
      adjustedClose: finitePositive(
        adjusted?.[index],
        "Yahoo " + expectedSymbol,
      ),
      volume: Number(quote?.volume?.[index] ?? 0),
      dividend: dividends.get(date) ?? 0,
      splitRatio: splits.get(date) ?? 1,
    };
  });
  return {
    symbol: expectedSymbol,
    timezone: result.meta.exchangeTimezoneName,
    bars,
  };
}
~~~

- [ ] **Step 4: 实现复权 OHLC 和独立总回报复算**

把以下导出追加到同一文件：

~~~javascript
export function normalizeYahooSeries(parsed) {
  return {
    symbol: parsed.symbol,
    timezone: parsed.timezone,
    bars: parsed.bars.map((bar) => {
      const factor = bar.adjustedClose / bar.close;
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new Error("Yahoo " + parsed.symbol + " adjustment is invalid.");
      }
      return {
        ...bar,
        factor,
        adjustedOpen: bar.open * factor,
        adjustedHigh: bar.high * factor,
        adjustedLow: bar.low * factor,
      };
    }),
  };
}

export function reconstructTotalReturn(bars) {
  let index = 1;
  return bars.map((bar, position) => {
    if (position > 0) {
      const previous = bars[position - 1];
      const comparablePreviousClose = previous.close / bar.splitRatio;
      index *= (bar.close + bar.dividend) / comparablePreviousClose;
    }
    return { date: bar.date, index };
  });
}

export function retainCompletedSessions(series, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const localDate = parts.year + "-" + parts.month + "-" + parts.day;
  const localMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const bars = [...series.bars];
  if (bars.at(-1)?.date === localDate && localMinute < 16 * 60 + 15) {
    bars.pop();
  }
  if (bars.length === 0) throw new Error("No completed Yahoo sessions remain.");
  return { ...series, bars };
}
~~~

- [ ] **Step 5: 运行测试**

Run: <code>node --test tests/dual-momentum/yahoo.test.mjs</code>

Expected: PASS，5 tests，0 fail。

- [ ] **Step 6: 提交 Yahoo 适配器**

~~~bash
git add src/dual-momentum/yahoo.mjs tests/dual-momentum/yahoo.test.mjs
git commit -m "feat: add Yahoo adjusted market data adapter"
~~~

### Task 3: TradingView 交叉检查与数据门禁

**Files:**
- Create: <code>src/dual-momentum/tradingview.mjs</code>
- Create: <code>src/dual-momentum/data.mjs</code>
- Create: <code>tests/dual-momentum/data.test.mjs</code>

- [ ] **Step 1: 写共同日历、复算偏差和跨源偏差测试**

~~~javascript
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
  assert.deepEqual(calls, [
    "symbol AMEX:SPY",
    "timeframe 1D",
    "ohlcv --count 5000",
    "symbol NASDAQ:QQQ",
    "timeframe 1D",
    "ohlcv --count 5000",
  ]);
});
~~~

- [ ] **Step 2: 运行门禁测试并确认失败**

Run: <code>node --test tests/dual-momentum/data.test.mjs</code>

Expected: FAIL，缺少 <code>data.mjs</code> 或 <code>tradingview.mjs</code>。

- [ ] **Step 3: 实现 TradingView 顺序适配器**

~~~javascript
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
~~~

- [ ] **Step 4: 实现数据验证和清单**

~~~javascript
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
  for (const bar of tradingViewBars ?? []) {
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
~~~

- [ ] **Step 5: 运行数据测试**

Run: <code>node --test tests/dual-momentum/data.test.mjs</code>

Expected: PASS，4 tests，0 fail。

- [ ] **Step 6: 提交数据门禁**

~~~bash
git add src/dual-momentum/data.mjs src/dual-momentum/tradingview.mjs tests/dual-momentum/data.test.mjs
git commit -m "feat: add dual-source market data gates"
~~~

### Task 4: 固定信号规则

**Files:**
- Create: <code>src/dual-momentum/signals.mjs</code>
- Create: <code>tests/dual-momentum/signals.test.mjs</code>

- [ ] **Step 1: 写双动量、平局、BIL 门槛和对照测试**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDualMomentumSignals,
  buildMonthlySmaSignals,
  buildSma200Signals,
} from "../../src/dual-momentum/signals.mjs";

function monthly(symbol, values) {
  return {
    symbol,
    bars: values.map((value, index) => ({
      date: String(2020 + Math.floor(index / 12)) + "-" +
        String((index % 12) + 1).padStart(2, "0") + "-28",
      adjustedClose: value,
    })),
  };
}

test("chooses relative winner only when it beats BIL and resolves ties to SPY", () => {
  const yahoo = {
    SPY: monthly("SPY", [...Array(12).fill(100), 110, 111]),
    QQQ: monthly("QQQ", [...Array(12).fill(100), 110, 112]),
    BIL: monthly("BIL", [...Array(12).fill(100), 105, 113]),
  };
  const signals = buildDualMomentumSignals(yahoo);
  assert.equal(signals[0].target, "SPY");
  assert.equal(signals[1].target, "BIL");
  assert.equal(signals[0].values.lookbackMonths, 12);
});

test("uses only completed observations for fixed SMA controls", () => {
  const daily = Array.from({ length: 202 }, (_, index) => ({
    date: new Date(Date.UTC(2021, 0, index + 1)).toISOString().slice(0, 10),
    adjustedClose: index < 200 ? 100 : 101,
  }));
  const sma200 = buildSma200Signals({ bars: daily });
  assert.equal(sma200.at(-1).target, "SPY");

  const monthlySeries = monthly("SPY", [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11]);
  assert.equal(buildMonthlySmaSignals(monthlySeries).at(-1).target, "SPY");
});

test("does not change an old signal when future prices change", () => {
  const base = {
    SPY: monthly("SPY", [...Array(13).fill(100), 110]),
    QQQ: monthly("QQQ", [...Array(13).fill(100), 105]),
    BIL: monthly("BIL", [...Array(13).fill(100), 101]),
  };
  const before = buildDualMomentumSignals(base)[0];
  base.QQQ.bars.push({ date: "2022-03-28", adjustedClose: 1_000 });
  const after = buildDualMomentumSignals(base)[0];
  assert.deepEqual(after, before);
});

test("rejects a missing calendar month instead of shortening the lookback", () => {
  const broken = {
    SPY: monthly("SPY", Array(14).fill(100)),
    QQQ: monthly("QQQ", Array(14).fill(100)),
    BIL: monthly("BIL", Array(14).fill(100)),
  };
  for (const series of Object.values(broken)) series.bars.splice(5, 1);
  assert.throws(() => buildDualMomentumSignals(broken), /12 calendar months/);
});
~~~

- [ ] **Step 2: 运行信号测试并确认失败**

Run: <code>node --test tests/dual-momentum/signals.test.mjs</code>

Expected: FAIL，缺少 <code>signals.mjs</code>。

- [ ] **Step 3: 实现月末序列和双动量**

~~~javascript
import {
  DAILY_SMA_LENGTH,
  LOOKBACK_MONTHS,
  MONTHLY_SMA_LENGTH,
} from "./config.mjs";

function monthKey(date) {
  return date.slice(0, 7);
}

function monthEnds(series) {
  const output = [];
  for (const bar of series.bars) {
    const key = monthKey(bar.date);
    if (output.at(-1)?.month === key) output[output.length - 1] = { ...bar, month: key };
    else output.push({ ...bar, month: key });
  }
  return output;
}

function offsetMonth(month, offset) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return date.getUTCFullYear() + "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0");
}

export function buildDualMomentumSignals(seriesBySymbol) {
  const monthly = Object.fromEntries(
    Object.entries(seriesBySymbol).map(([key, value]) => [key, monthEnds(value)]),
  );
  const output = [];
  for (let index = LOOKBACK_MONTHS; index < monthly.SPY.length; index += 1) {
    const month = monthly.SPY[index].month;
    if (monthly.QQQ[index]?.month !== month || monthly.BIL[index]?.month !== month) {
      throw new Error("Dual momentum month-end calendars do not align.");
    }
    const expectedPriorMonth = offsetMonth(month, -LOOKBACK_MONTHS);
    if (monthly.SPY[index - LOOKBACK_MONTHS].month !== expectedPriorMonth ||
        monthly.QQQ[index - LOOKBACK_MONTHS].month !== expectedPriorMonth ||
        monthly.BIL[index - LOOKBACK_MONTHS].month !== expectedPriorMonth) {
      throw new Error("Dual momentum lookback must span 12 calendar months.");
    }
    const spy = monthly.SPY[index].adjustedClose /
      monthly.SPY[index - LOOKBACK_MONTHS].adjustedClose - 1;
    const qqq = monthly.QQQ[index].adjustedClose /
      monthly.QQQ[index - LOOKBACK_MONTHS].adjustedClose - 1;
    const bil = monthly.BIL[index].adjustedClose /
      monthly.BIL[index - LOOKBACK_MONTHS].adjustedClose - 1;
    const winner = spy >= qqq ? "SPY" : "QQQ";
    const winnerReturn = winner === "SPY" ? spy : qqq;
    output.push({
      signalDate: monthly.SPY[index].date,
      target: winnerReturn > bil ? winner : "BIL",
      values: { SPY: spy, QQQ: qqq, BIL: bil, lookbackMonths: LOOKBACK_MONTHS },
    });
  }
  return output;
}
~~~

- [ ] **Step 4: 实现两个固定均线对照**

把以下函数追加到同一文件：

~~~javascript
function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildSma200Signals(spySeries) {
  const output = [];
  for (let index = DAILY_SMA_LENGTH - 1; index < spySeries.bars.length; index += 1) {
    const window = spySeries.bars
      .slice(index - DAILY_SMA_LENGTH + 1, index + 1)
      .map((bar) => bar.adjustedClose);
    const close = spySeries.bars[index].adjustedClose;
    output.push({
      signalDate: spySeries.bars[index].date,
      target: close > average(window) ? "SPY" : "BIL",
      values: { close, sma: average(window), length: DAILY_SMA_LENGTH },
    });
  }
  return output;
}

export function buildMonthlySmaSignals(spySeries) {
  const rows = monthEnds(spySeries);
  const output = [];
  for (let index = MONTHLY_SMA_LENGTH - 1; index < rows.length; index += 1) {
    const window = rows
      .slice(index - MONTHLY_SMA_LENGTH + 1, index + 1)
      .map((bar) => bar.adjustedClose);
    const close = rows[index].adjustedClose;
    output.push({
      signalDate: rows[index].date,
      target: close > average(window) ? "SPY" : "BIL",
      values: { close, sma: average(window), length: MONTHLY_SMA_LENGTH },
    });
  }
  return output;
}
~~~

- [ ] **Step 5: 运行信号测试**

Run: <code>node --test tests/dual-momentum/signals.test.mjs</code>

Expected: PASS，4 tests，0 fail。

- [ ] **Step 6: 提交信号模块**

~~~bash
git add src/dual-momentum/signals.mjs tests/dual-momentum/signals.test.mjs
git commit -m "feat: add fixed dual-momentum and moving-average signals"
~~~

### Task 5: Webull、Robinhood 与零成本

**Files:**
- Create: <code>src/dual-momentum/costs.mjs</code>
- Create: <code>tests/dual-momentum/costs.test.mjs</code>

- [ ] **Step 1: 写费率、免收门槛和取整测试**

~~~javascript
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
  assert.equal(costs.cat, 0.0003);
  assert.equal(costs.slippage, 1);
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
~~~

- [ ] **Step 2: 运行费用测试并确认失败**

Run: <code>node --test tests/dual-momentum/costs.test.mjs</code>

Expected: FAIL，缺少 <code>costs.mjs</code>。

- [ ] **Step 3: 实现三个冻结成本配置**

~~~javascript
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
~~~

- [ ] **Step 4: 实现订单成本计算**

把以下导出追加到同一文件：

~~~javascript
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
~~~

- [ ] **Step 5: 运行费用测试**

Run: <code>node --test tests/dual-momentum/costs.test.mjs</code>

Expected: PASS，4 tests，0 fail。

- [ ] **Step 6: 提交费用模块**

~~~bash
git add src/dual-momentum/costs.mjs tests/dual-momentum/costs.test.mjs
git commit -m "feat: add broker cost scenarios"
~~~

### Task 6: 下一交易日组合回放

**Files:**
- Create: <code>src/dual-momentum/portfolio.mjs</code>
- Create: <code>tests/dual-momentum/portfolio.test.mjs</code>

- [ ] **Step 1: 写开盘换仓、95% 建仓和自然漂移测试**

~~~javascript
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
~~~

- [ ] **Step 2: 运行组合测试并确认失败**

Run: <code>node --test tests/dual-momentum/portfolio.test.mjs</code>

Expected: FAIL，缺少 <code>portfolio.mjs</code>。

- [ ] **Step 3: 实现信号到执行日映射和换仓**

~~~javascript
import {
  EVALUATION_START,
  INITIAL_CAPITAL,
  POSITION_FRACTION,
} from "./config.mjs";
import { calculateOrderCosts } from "./costs.mjs";

function mapBars(seriesBySymbol) {
  return Object.fromEntries(
    Object.entries(seriesBySymbol).map(([symbol, series]) => [
      symbol,
      new Map(series.bars.map((bar) => [bar.date, bar])),
    ]),
  );
}

function executionSchedule(signals, dates) {
  const schedule = new Map();
  for (const signal of signals) {
    const executionDate = dates.find((date) => date > signal.signalDate);
    if (!executionDate) continue;
    schedule.set(executionDate, signal);
  }
  return schedule;
}

function tradeRecord({ date, symbol, side, costs, shares, signalDate, equity }) {
  return {
    date,
    signalDate,
    symbol,
    side,
    shares,
    executionPrice: costs.executionPrice,
    notional: costs.notional,
    fees: costs.totalFees,
    slippage: costs.slippage,
    equityBeforeTrade: equity,
    targetFraction: costs.notional / equity,
  };
}

export function backtestPortfolio({
  seriesBySymbol,
  signals,
  costProfile,
  startDate = EVALUATION_START,
  endDate = null,
  initialCapital = INITIAL_CAPITAL,
  positionFraction = POSITION_FRACTION,
}) {
  const symbols = Object.keys(seriesBySymbol);
  const dates = seriesBySymbol[symbols[0]].bars.map((bar) => bar.date);
  const bars = mapBars(seriesBySymbol);
  const schedule = executionSchedule(signals, dates);
  let cash = initialCapital;
  let holding = null;
  let shares = 0;
  const trades = [];
  const daily = [];

  for (const date of dates.filter((value) =>
    value >= startDate && (endDate === null || value <= endDate))) {
    const signal = schedule.get(date);
    if (signal && !symbols.includes(signal.target)) {
      throw new Error("Unknown target " + signal.target + ".");
    }
    if (signal && signal.target !== holding) {
      if (holding !== null) {
        const rawPrice = bars[holding].get(date)?.adjustedOpen;
        const equityBefore = cash + shares * rawPrice;
        const costs = calculateOrderCosts(costProfile, {
          side: "sell", shares, rawPrice,
        });
        cash += costs.notional - costs.totalFees;
        trades.push(tradeRecord({
          date,
          signalDate: signal.signalDate,
          symbol: holding,
          side: "sell",
          shares,
          costs,
          equity: equityBefore,
        }));
        holding = null;
        shares = 0;
      }
      const rawPrice = bars[signal.target].get(date)?.adjustedOpen;
      if (!Number.isFinite(rawPrice)) {
        throw new Error("Signal execution date is not on the common calendar.");
      }
      const equityBefore = cash;
      const executionPrice = rawPrice + costProfile.tick;
      const targetNotional = equityBefore * positionFraction;
      shares = targetNotional / executionPrice;
      const costs = calculateOrderCosts(costProfile, {
        side: "buy", shares, rawPrice,
      });
      cash -= costs.notional + costs.totalFees;
      if (cash < -1e-8 || costs.notional > equityBefore * positionFraction + 1e-8) {
        throw new Error("Portfolio funding or 95% target invariant failed.");
      }
      holding = signal.target;
      trades.push(tradeRecord({
        date,
        signalDate: signal.signalDate,
        symbol: holding,
        side: "buy",
        shares,
        costs,
        equity: equityBefore,
      }));
    }
    const close = holding === null ? 0 : bars[holding].get(date).adjustedClose;
    const marketValue = shares * close;
    const equity = cash + marketValue;
    if (!Number.isFinite(equity) || equity <= 0 || cash < -1e-8 || shares < 0) {
      throw new Error("Portfolio state invariant failed on " + date + ".");
    }
    daily.push({
      date,
      equity,
      cash,
      holding,
      shares,
      marketValue,
      exposure: marketValue / equity,
    });
  }
  return {
    initialCapital,
    costProfile: costProfile.name,
    daily,
    trades,
  };
}
~~~

- [ ] **Step 4: 增加终点假设清仓计算**

把以下导出追加到同一文件：

~~~javascript
export function hypotheticalLiquidation(result, seriesBySymbol, costProfile) {
  const last = result.daily.at(-1);
  if (!last || last.holding === null) {
    return { equity: last?.equity ?? result.initialCapital, fees: 0, slippage: 0 };
  }
  const bar = seriesBySymbol[last.holding].bars.find(
    (candidate) => candidate.date === last.date,
  );
  const costs = calculateOrderCosts(costProfile, {
    side: "sell",
    shares: last.shares,
    rawPrice: bar.adjustedClose,
  });
  return {
    equity: last.cash + costs.notional - costs.totalFees,
    fees: costs.totalFees,
    slippage: costs.slippage,
  };
}
~~~

- [ ] **Step 5: 运行组合测试**

Run: <code>node --test tests/dual-momentum/portfolio.test.mjs</code>

Expected: PASS，5 tests，0 fail。

- [ ] **Step 6: 提交组合引擎**

~~~bash
git add src/dual-momentum/portfolio.mjs tests/dual-momentum/portfolio.test.mjs
git commit -m "feat: add dual-momentum portfolio simulator"
~~~

### Task 7: 指标、独立复算和资格门禁

**Files:**
- Create: <code>src/dual-momentum/metrics.mjs</code>
- Create: <code>tests/dual-momentum/metrics.test.mjs</code>

- [ ] **Step 1: 写收益、回撤和严格资格测试**

~~~javascript
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
~~~

- [ ] **Step 2: 运行指标测试并确认失败**

Run: <code>node --test tests/dual-momentum/metrics.test.mjs</code>

Expected: FAIL，缺少 <code>metrics.mjs</code>。

- [ ] **Step 3: 实现指标和逐日回撤**

~~~javascript
function annualizedYears(start, end) {
  return (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
    (365.2425 * 86_400_000);
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / (values.length - 1);
  return Math.sqrt(variance);
}

export function independentReturnAndDrawdown(initialCapital, daily) {
  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const row of daily) {
    peak = Math.max(peak, row.equity);
    maxDrawdown = Math.min(maxDrawdown, row.equity / peak - 1);
  }
  return {
    totalReturn: daily.at(-1).equity / initialCapital - 1,
    maxDrawdown,
  };
}

export function computeMetrics(result) {
  if (!result.daily.length) throw new Error("Metrics require daily equity.");
  const returns = [];
  let prior = result.initialCapital;
  let peak = result.initialCapital;
  let peakDate = result.daily[0].date;
  let maxDrawdown = 0;
  let drawdownPeakDate = peakDate;
  let drawdownTroughDate = peakDate;
  let drawdownPeakEquity = peak;
  const equity = result.daily.map((row) => {
    const dailyReturn = row.equity / prior - 1;
    returns.push(dailyReturn);
    prior = row.equity;
    if (row.equity > peak) {
      peak = row.equity;
      peakDate = row.date;
    }
    const drawdown = row.equity / peak - 1;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      drawdownPeakDate = peakDate;
      drawdownTroughDate = row.date;
      drawdownPeakEquity = peak;
    }
    return { ...row, dailyReturn, drawdown };
  });
  const totalReturn = equity.at(-1).equity / result.initialCapital - 1;
  const years = annualizedYears(equity[0].date, equity.at(-1).date);
  const cagr = years > 0 ? (1 + totalReturn) ** (1 / years) - 1 : totalReturn;
  const meanDaily = returns.reduce((sum, value) => sum + value, 0) /
    returns.length;
  const dailyVolatility = sampleStandardDeviation(returns);
  const annualizedVolatility = dailyVolatility * Math.sqrt(252);
  const sharpe = dailyVolatility === 0 ? null :
    meanDaily / dailyVolatility * Math.sqrt(252);
  const fees = result.trades.reduce((sum, trade) => sum + trade.fees, 0);
  const slippage = result.trades.reduce((sum, trade) => sum + trade.slippage, 0);
  const turnover = result.trades.reduce(
    (sum, trade) => sum + trade.notional,
    0,
  ) / result.initialCapital;
  const annualReturns = {};
  const holdingBreakdown = {};
  let annualStart = result.initialCapital;
  let activeYear = equity[0].date.slice(0, 4);
  for (let index = 0; index < equity.length; index += 1) {
    const year = equity[index].date.slice(0, 4);
    const nextYear = equity[index + 1]?.date.slice(0, 4);
    if (year !== activeYear) {
      throw new Error("Daily equity years are not ordered.");
    }
    if (nextYear !== year) {
      annualReturns[year] = equity[index].equity / annualStart - 1;
      annualStart = equity[index].equity;
      activeYear = nextYear;
    }
    const holding = equity[index].holding ?? "CASH";
    const breakdown = holdingBreakdown[holding] ?? {
      days: 0,
      compoundedReturn: 0,
    };
    breakdown.days += 1;
    breakdown.compoundedReturn =
      (1 + breakdown.compoundedReturn) * (1 + equity[index].dailyReturn) - 1;
    holdingBreakdown[holding] = breakdown;
  }
  const recovery = maxDrawdown < 0
    ? equity.find((row) =>
      row.date > drawdownTroughDate && row.equity >= drawdownPeakEquity)
    : undefined;
  return {
    startDate: equity[0].date,
    endDate: equity.at(-1).date,
    initialEquity: result.initialCapital,
    finalEquity: equity.at(-1).equity,
    totalReturn,
    cagr,
    maxDrawdown,
    drawdownPeakDate,
    drawdownTroughDate,
    drawdownRecoveryDate: recovery?.date ?? null,
    annualizedVolatility,
    sharpe,
    calmar: maxDrawdown === 0 ? null : cagr / Math.abs(maxDrawdown),
    tradeCount: result.trades.length,
    switchCount: Math.max(0, result.trades.filter((trade) =>
      trade.side === "buy").length - 1),
    turnover,
    fees,
    slippage,
    annualReturns,
    holdingBreakdown,
    equity,
  };
}
~~~

- [ ] **Step 4: 实现严格 PASS/FAIL/UNVERIFIED 门禁**

把以下导出追加到同一文件：

~~~javascript
export function evaluateQualification({ strategy, benchmark, dataVerified }) {
  if (!dataVerified) {
    return { status: "UNVERIFIED", profiles: {}, reason: "Data gate failed." };
  }
  const profiles = {};
  for (const name of ["webull_current", "robinhood_current"]) {
    const candidate = strategy[name];
    const spy = benchmark[name];
    const returnPassed = candidate.totalReturn > spy.totalReturn;
    const drawdownPassed =
      Math.abs(candidate.maxDrawdown) <= Math.abs(spy.maxDrawdown);
    profiles[name] = {
      returnPassed,
      drawdownPassed,
      excessReturn: candidate.totalReturn - spy.totalReturn,
      drawdownDifference:
        Math.abs(candidate.maxDrawdown) - Math.abs(spy.maxDrawdown),
      passed: returnPassed && drawdownPassed,
    };
  }
  return {
    status: Object.values(profiles).every((profile) => profile.passed)
      ? "PASS"
      : "FAIL",
    profiles,
  };
}
~~~

- [ ] **Step 5: 运行指标测试**

Run: <code>node --test tests/dual-momentum/metrics.test.mjs</code>

Expected: PASS，3 tests，0 fail。

- [ ] **Step 6: 提交指标和门禁**

~~~bash
git add src/dual-momentum/metrics.mjs tests/dual-momentum/metrics.test.mjs
git commit -m "feat: add metrics and qualification gates"
~~~

### Task 8: 一致的结构化报告和原子发布

**Files:**
- Create: <code>src/dual-momentum/report.mjs</code>
- Create: <code>tests/dual-momentum/report.test.mjs</code>

- [ ] **Step 1: 写多格式一致性和回滚测试**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  publishReport,
  renderMarkdown,
  toEquityCsv,
  toTradesCsv,
} from "../../src/dual-momentum/report.mjs";

const bundle = {
  schemaVersion: 1,
  generatedAt: "2026-08-30T12:00:00.000Z",
  period: { start: "2022-01-03", end: "2026-08-28" },
  qualification: { status: "PASS", profiles: {} },
  quality: { verified: true },
  strategies: {
    dual_momentum: {
      webull_current: {
        metrics: { totalReturn: 0.5, maxDrawdown: -0.15 },
        trades: [{ date: "2022-01-03", side: "buy", symbol: "SPY", shares: 1 }],
        equity: [{ date: "2022-01-03", equity: 100_000, drawdown: 0 }],
      },
      robinhood_current: {
        metrics: { totalReturn: 0.49, maxDrawdown: -0.15 },
        trades: [],
        equity: [],
      },
    },
    spy_buy_hold: {
      webull_current: {
        metrics: { totalReturn: 0.4, maxDrawdown: -0.2 },
        trades: [],
        equity: [],
      },
      robinhood_current: {
        metrics: { totalReturn: 0.39, maxDrawdown: -0.2 },
        trades: [],
        equity: [],
      },
    },
  },
  dataManifest: { sources: {} },
};

test("renders the same gate and figures in Markdown and CSV artifacts", () => {
  assert.match(renderMarkdown(bundle), /PASS/);
  assert.match(renderMarkdown(bundle), /50\.00%/);
  assert.match(renderMarkdown(bundle), /robinhood_current/);
  assert.match(renderMarkdown(bundle), /49\.00%/);
  assert.match(toTradesCsv(bundle), /dual_momentum,webull_current/);
  assert.match(toEquityCsv(bundle), /100000/);
});

test("publishes a complete report directory", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dual-report-"));
  try {
    const output = publishReport(bundle, {
      outputRoot: root,
      runDate: "2026-08-30",
    });
    for (const name of [
      "metrics.json", "trades.csv", "equity.csv",
      "data-manifest.json", "summary.md", "report.html",
    ]) {
      assert.equal(existsSync(path.join(output.directory, name)), true);
    }
    assert.equal(JSON.parse(readFileSync(output.metrics, "utf8"))
      .qualification.status, "PASS");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not leave a partial final directory when publication fails", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dual-report-fail-"));
  try {
    assert.throws(
      () => publishReport(bundle, {
        outputRoot: root,
        runDate: "2026-08-30",
        operations: {
          writeFile: () => { throw new Error("injected write failure"); },
        },
      }),
      /injected write failure/,
    );
    assert.equal(
      existsSync(path.join(root, "2026-08-30-spy-qqq-bil-dual-momentum")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
~~~

- [ ] **Step 2: 运行报告测试并确认失败**

Run: <code>node --test tests/dual-momentum/report.test.mjs</code>

Expected: FAIL，缺少 <code>report.mjs</code>。

- [ ] **Step 3: 实现 Markdown 和 CSV 渲染**

~~~javascript
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function percent(value) {
  return Number.isFinite(value) ? (value * 100).toFixed(2) + "%" : "不可用";
}

function csv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function renderMarkdown(bundle) {
  const lines = [
    "# SPY、QQQ 与 BIL 双动量回测报告",
    "",
    "结论：" + bundle.qualification.status,
    "",
    "| 策略 | 成本口径 | 累计收益 | CAGR | 最大回撤 | 交易数 | 费用 | 假设清仓权益 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const [strategy, profiles] of Object.entries(bundle.strategies ?? {})) {
    for (const [profile, result] of Object.entries(profiles)) {
      const metrics = result.metrics ?? {};
      lines.push(
        "| " + strategy + " | " + profile + " | " +
        percent(metrics.totalReturn) + " | " + percent(metrics.cagr) + " | " +
        percent(metrics.maxDrawdown) + " | " + (metrics.tradeCount ?? "不可用") +
        " | " + (Number.isFinite(metrics.fees) ? metrics.fees.toFixed(2) : "不可用") +
        " | " + (Number.isFinite(result.liquidation?.equity)
          ? result.liquidation.equity.toFixed(2) : "不可用") +
        " |",
      );
    }
  }
  lines.push(
    "",
    "回测区间：" + bundle.period.start + " 至 " + bundle.period.end,
    "",
    "数据门禁：" + (bundle.quality?.verified ? "通过" : "未通过"),
    "",
    ...(bundle.developmentSanity ? [
      "开发期合理性检查（不用于选择规则）：" +
        bundle.developmentSanity.period.start + " 至 " +
        bundle.developmentSanity.period.end,
      "开发期双动量累计收益：" +
        percent(bundle.developmentSanity.dualMomentum.totalReturn),
      "开发期 SPY 累计收益：" +
        percent(bundle.developmentSanity.spyBuyHold.totalReturn),
      "",
    ] : []),
    "资格明细：" + JSON.stringify(bundle.qualification.profiles ?? {}),
    "",
    "双动量 Webull 持仓阶段：" + JSON.stringify(
      bundle.strategies?.dual_momentum?.webull_current?.metrics
        ?.holdingBreakdown ?? {},
    ),
    "",
    "限制：Webull 与 Robinhood 当前费率统一应用于整个历史区间，" +
      "不是逐日历史费率复原；结果未计税费。",
    "",
    "本报告没有连接券商或提交任何订单。",
    "",
  );
  return lines.join("\n");
}

export function toTradesCsv(bundle) {
  const rows = [["strategy", "profile", "signalDate", "date", "side", "symbol",
    "shares", "executionPrice", "notional", "fees", "slippage",
    "equityBeforeTrade", "targetFraction"]];
  for (const [strategy, profiles] of Object.entries(bundle.strategies ?? {})) {
    for (const [profile, result] of Object.entries(profiles)) {
      for (const trade of result.trades ?? []) {
        rows.push([
          strategy, profile, trade.signalDate, trade.date, trade.side,
          trade.symbol, trade.shares, trade.executionPrice, trade.notional,
          trade.fees, trade.slippage, trade.equityBeforeTrade,
          trade.targetFraction,
        ]);
      }
    }
  }
  return rows.map((row) => row.map(csv).join(",")).join("\n") + "\n";
}

export function toEquityCsv(bundle) {
  const rows = [["strategy", "profile", "date", "equity", "drawdown",
    "holding", "cash"]];
  for (const [strategy, profiles] of Object.entries(bundle.strategies ?? {})) {
    for (const [profile, result] of Object.entries(profiles)) {
      for (const row of result.equity ?? []) {
        rows.push([
          strategy, profile, row.date, row.equity, row.drawdown,
          row.holding, row.cash,
        ]);
      }
    }
  }
  return rows.map((row) => row.map(csv).join(",")).join("\n") + "\n";
}
~~~

- [ ] **Step 4: 实现便携 HTML 和目录级原子发布**

把以下函数追加到同一文件：

~~~javascript
export function renderHtml(bundle) {
  const embedded = JSON.stringify(bundle).replaceAll("<", "\\u003c");
  return "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>双动量回测报告</title><style>" +
    "body{font:16px/1.55 system-ui;max-width:1100px;margin:40px auto;padding:0 20px}" +
    "table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}" +
    ".PASS{color:#087830}.FAIL,.UNVERIFIED{color:#a11}" +
    "</style><body><h1>SPY、QQQ 与 BIL 双动量回测</h1>" +
    "<p class=\"" + bundle.qualification.status + "\">结论：" +
    bundle.qualification.status + "</p><pre id=\"summary\"></pre>" +
    "<script id=\"data\" type=\"application/json\">" + embedded + "</script>" +
    "<script>const d=JSON.parse(document.getElementById('data').textContent);" +
    "document.getElementById('summary').textContent=JSON.stringify({" +
    "period:d.period,qualification:d.qualification,strategies:d.strategies," +
    "quality:d.quality,developmentSanity:d.developmentSanity},null,2);" +
    "</script></body></html>";
}

export function publishReport(
  bundle,
  { outputRoot, runDate, operations = {} },
) {
  const writeFile = operations.writeFile ?? writeFileSync;
  const rename = operations.rename ?? renameSync;
  const remove = operations.remove ?? rmSync;
  const stem = runDate + "-spy-qqq-bil-dual-momentum";
  const finalDirectory = path.join(outputRoot, stem);
  const token = process.pid + "-" + randomUUID();
  const temporaryDirectory = path.join(outputRoot, ".dual-momentum-" + token + ".tmp");
  const backupDirectory = path.join(outputRoot, ".dual-momentum-" + token + ".backup");
  mkdirSync(outputRoot, { recursive: true });
  mkdirSync(temporaryDirectory, { recursive: false });
  try {
    const files = {
      "metrics.json": JSON.stringify(bundle, null, 2) + "\n",
      "trades.csv": toTradesCsv(bundle),
      "equity.csv": toEquityCsv(bundle),
      "data-manifest.json": JSON.stringify(bundle.dataManifest, null, 2) + "\n",
      "summary.md": renderMarkdown(bundle),
      "report.html": renderHtml(bundle),
    };
    for (const [name, contents] of Object.entries(files)) {
      writeFile(path.join(temporaryDirectory, name), contents, "utf8");
    }
    if (existsSync(finalDirectory)) rename(finalDirectory, backupDirectory);
    rename(temporaryDirectory, finalDirectory);
    if (existsSync(backupDirectory)) remove(backupDirectory, { recursive: true });
    return {
      directory: finalDirectory,
      metrics: path.join(finalDirectory, "metrics.json"),
      summary: path.join(finalDirectory, "summary.md"),
      html: path.join(finalDirectory, "report.html"),
    };
  } catch (error) {
    if (existsSync(temporaryDirectory)) {
      remove(temporaryDirectory, { recursive: true, force: true });
    }
    if (!existsSync(finalDirectory) && existsSync(backupDirectory)) {
      rename(backupDirectory, finalDirectory);
    }
    throw error;
  }
}
~~~

- [ ] **Step 5: 运行报告测试**

Run: <code>node --test tests/dual-momentum/report.test.mjs</code>

Expected: PASS，3 tests，0 fail。

- [ ] **Step 6: 提交报告器**

先把 <code>package.json</code> 的 <code>test:report</code> 更新为：

~~~json
"test:report": "node --test tests/run_tradingview_backtest.test.mjs tests/dual-momentum/report.test.mjs"
~~~

~~~bash
git add package.json src/dual-momentum/report.mjs tests/dual-momentum/report.test.mjs
git commit -m "feat: add atomic dual-momentum reports"
~~~

### Task 9: 独立 CSV 指标复算器

**Files:**
- Create: <code>src/dual-momentum/verify.mjs</code>
- Create: <code>scripts/verify_dual_momentum_report.mjs</code>
- Create: <code>tests/dual-momentum/verify.test.mjs</code>

- [ ] **Step 1: 写独立算法和落盘报告验证测试**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  independentlyComputeReturnAndDrawdown,
  verifyReport,
} from "../../src/dual-momentum/verify.mjs";

test("independently computes return and maximum drawdown", () => {
  const result = independentlyComputeReturnAndDrawdown(100, [120, 90, 110]);
  assert.ok(Math.abs(result.totalReturn - 0.1) < 1e-12);
  assert.ok(Math.abs(result.maxDrawdown - (-0.25)) < 1e-12);
});

test("verifies persisted CSV against JSON within 0.01 percentage points", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dual-verify-"));
  try {
    writeFileSync(path.join(directory, "metrics.json"), JSON.stringify({
      strategies: {
        dual_momentum: {
          webull_current: {
            metrics: {
              initialEquity: 100,
              totalReturn: 0.1,
              maxDrawdown: -0.25,
            },
          },
        },
      },
    }));
    writeFileSync(
      path.join(directory, "equity.csv"),
      "strategy,profile,date,equity,drawdown,holding,cash\n" +
        "dual_momentum,webull_current,2022-01-03,120,0,SPY,5\n" +
        "dual_momentum,webull_current,2022-01-04,90,-0.25,SPY,5\n" +
        "dual_momentum,webull_current,2022-01-05,110,-0.083333,SPY,5\n",
    );
    writeFileSync(
      path.join(directory, "trades.csv"),
      "strategy,profile,signalDate,date,side,symbol,shares,executionPrice,notional,fees,slippage,equityBeforeTrade,targetFraction\n" +
        "dual_momentum,webull_current,2021-12-31,2022-01-03,buy,SPY,1,100,95,0,0,100,0.95\n",
    );
    const result = verifyReport(directory);
    assert.equal(result.verified, true);
    assert.equal(result.seriesChecked, 1);
    assert.equal(result.tradesChecked, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects a material JSON and CSV discrepancy", () => {
  assert.throws(
    () => independentlyComputeReturnAndDrawdown(0, [1]),
    /Initial equity must be positive/,
  );
});
~~~

- [ ] **Step 2: 运行独立复算测试并确认失败**

Run: <code>node --test tests/dual-momentum/verify.test.mjs</code>

Expected: FAIL，缺少 <code>verify.mjs</code>。

- [ ] **Step 3: 实现不导入主指标模块的独立算法**

~~~javascript
import { readFileSync } from "node:fs";
import path from "node:path";

export function independentlyComputeReturnAndDrawdown(initialEquity, equities) {
  if (!Number.isFinite(initialEquity) || initialEquity <= 0) {
    throw new Error("Initial equity must be positive.");
  }
  if (!Array.isArray(equities) || equities.length === 0 ||
      equities.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Independent verification requires positive equity values.");
  }
  let peak = initialEquity;
  let maxDrawdown = 0;
  for (const equity of equities) {
    if (equity > peak) peak = equity;
    const drawdown = equity / peak - 1;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return {
    totalReturn: equities.at(-1) / initialEquity - 1,
    maxDrawdown,
  };
}

function readCsv(filePath) {
  const [header, ...lines] = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const fields = header.split(",");
  return lines.filter(Boolean).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(fields.map((field, index) => [field, values[index]]));
  });
}

export function verifyReport(directory, tolerance = 0.0001) {
  const metrics = JSON.parse(readFileSync(path.join(directory, "metrics.json"), "utf8"));
  const rows = readCsv(path.join(directory, "equity.csv"));
  const trades = readCsv(path.join(directory, "trades.csv"));
  let seriesChecked = 0;
  for (const [strategy, profiles] of Object.entries(metrics.strategies ?? {})) {
    for (const [profile, result] of Object.entries(profiles)) {
      const selected = rows.filter((row) =>
        row.strategy === strategy && row.profile === profile);
      if (selected.length === 0) {
        throw new Error("Missing equity CSV rows for " + strategy + "/" + profile + ".");
      }
      const independent = independentlyComputeReturnAndDrawdown(
        result.metrics.initialEquity,
        selected.map((row) => Number(row.equity)),
      );
      for (const field of ["totalReturn", "maxDrawdown"]) {
        if (Math.abs(independent[field] - result.metrics[field]) > tolerance) {
          throw new Error(
            strategy + "/" + profile + " " + field +
              " differs by more than 0.01 percentage points.",
          );
        }
      }
      seriesChecked += 1;
    }
  }
  let tradesChecked = 0;
  for (const [strategy, profiles] of Object.entries(metrics.strategies ?? {})) {
    for (const profile of Object.keys(profiles)) {
      const dates = rows.filter((row) =>
        row.strategy === strategy && row.profile === profile)
        .map((row) => row.date);
      const selectedTrades = trades.filter((trade) =>
        trade.strategy === strategy && trade.profile === profile);
      if (selectedTrades.length === 0 || selectedTrades[0].side !== "buy") {
        throw new Error(strategy + "/" + profile + " is missing its initial buy.");
      }
      let holding = null;
      let hasOpened = false;
      let lastSold = null;
      for (const trade of selectedTrades) {
        const expectedDate = dates.find((date) => date > trade.signalDate);
        if (trade.date !== expectedDate) {
          throw new Error(strategy + "/" + profile + " did not trade next session.");
        }
        if (trade.side === "buy") {
          const fraction = Number(trade.notional) /
            Number(trade.equityBeforeTrade);
          const validSwitch = !hasOpened || (
            lastSold?.date === trade.date && lastSold.symbol !== trade.symbol
          );
          if (holding !== null || !Number.isFinite(fraction) ||
              fraction > 0.95 + 1e-12 || !validSwitch) {
            throw new Error(strategy + "/" + profile + " buy invariant failed.");
          }
          holding = trade.symbol;
          hasOpened = true;
          lastSold = null;
        } else if (trade.side === "sell") {
          if (holding !== trade.symbol) {
            throw new Error(strategy + "/" + profile + " sell invariant failed.");
          }
          lastSold = { date: trade.date, symbol: trade.symbol };
          holding = null;
        } else {
          throw new Error("Unknown persisted trade side.");
        }
        tradesChecked += 1;
      }
    }
  }
  return { verified: true, seriesChecked, tradesChecked, tolerance };
}
~~~

- [ ] **Step 4: 增加可直接运行的验证入口**

~~~javascript
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReport } from "../src/dual-momentum/verify.mjs";

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) {
    process.stderr.write("Usage: node scripts/verify_dual_momentum_report.mjs <report-directory>\n");
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(verifyReport(path.resolve(directory))) + "\n");
    } catch (error) {
      process.stderr.write(error.stack + "\n");
      process.exitCode = 1;
    }
  }
}
~~~

- [ ] **Step 5: 运行复算测试**

Run: <code>node --test tests/dual-momentum/verify.test.mjs</code>

Expected: PASS，3 tests，0 fail。

- [ ] **Step 6: 提交独立复算器**

~~~bash
git add src/dual-momentum/verify.mjs scripts/verify_dual_momentum_report.mjs tests/dual-momentum/verify.test.mjs
git commit -m "test: add independent backtest verification"
~~~

### Task 10: 端到端编排和命令行

**Files:**
- Create: <code>scripts/run_dual_momentum_backtest.mjs</code>
- Create: <code>tests/dual-momentum/runner.test.mjs</code>

- [ ] **Step 1: 写依赖注入式端到端测试**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";

import { runDualMomentumBacktest } from "../../scripts/run_dual_momentum_backtest.mjs";

function syntheticSeries(symbol, multiplier) {
  const bars = [];
  const cursor = new Date("2008-01-01T00:00:00Z");
  const end = new Date("2022-06-30T00:00:00Z");
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const month = (cursor.getUTCFullYear() - 2008) * 12 + cursor.getUTCMonth();
      const price = 100 * multiplier + month * multiplier;
      bars.push({
        date: cursor.toISOString().slice(0, 10),
        open: price, high: price, low: price, close: price,
        adjustedOpen: price, adjustedHigh: price, adjustedLow: price,
        adjustedClose: price, factor: 1, dividend: 0, splitRatio: 1,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { symbol, bars };
}

test("runs every strategy and profile from one frozen data bundle", async () => {
  let published = null;
  const yahoo = {
    SPY: syntheticSeries("SPY", 1),
    QQQ: syntheticSeries("QQQ", 1.2),
    BIL: syntheticSeries("BIL", 0.9),
  };
  const tradingview = Object.fromEntries(
    Object.entries(yahoo).map(([symbol, series]) => [
      symbol,
      series.bars.map((bar) => ({ date: bar.date, close: bar.close })),
    ]),
  );
  const result = await runDualMomentumBacktest({
    now: () => new Date("2022-06-30T22:00:00Z"),
    loadYahoo: async () => ({
      normalized: yahoo,
      rawSources: Object.fromEntries(
        Object.keys(yahoo).map((symbol) => [
          symbol, { url: "fixture:" + symbol, payload: { symbol } },
        ]),
      ),
    }),
    loadTradingView: async () => tradingview,
    publish: (bundle) => {
      published = bundle;
      return { directory: "/tmp/test-report" };
    },
  });
  assert.equal(result.output.directory, "/tmp/test-report");
  assert.deepEqual(Object.keys(published.strategies), [
    "dual_momentum", "sma_200", "sma_10m", "spy_buy_hold",
  ]);
  assert.deepEqual(Object.keys(published.strategies.dual_momentum), [
    "zero_cost", "webull_current", "robinhood_current",
  ]);
  assert.equal(published.developmentSanity.selectionUsed, false);
  assert.deepEqual(published.developmentSanity.period, {
    start: "2009-02-02",
    end: "2021-12-31",
  });
  assert.match(published.qualification.status, /PASS|FAIL/);
  assert.ok(published.signals.dual_momentum.length > 0);
});

test("publishes UNVERIFIED for a data-quality mismatch but not for fetch failure", async () => {
  let diagnostic = null;
  const base = {
    now: () => new Date("2022-06-30T22:00:00Z"),
    loadYahoo: async () => { throw new Error("network down"); },
    loadTradingView: async () => ({}),
    publish: (bundle) => { diagnostic = bundle; return {}; },
  };
  await assert.rejects(() => runDualMomentumBacktest(base), /network down/);
  assert.equal(diagnostic, null);

  const yahoo = {
    SPY: syntheticSeries("SPY", 1),
    QQQ: syntheticSeries("QQQ", 1.2),
    BIL: syntheticSeries("BIL", 0.9),
  };
  const tradingview = Object.fromEntries(
    Object.entries(yahoo).map(([symbol, series]) => [
      symbol,
      series.bars.map((bar) => ({ date: bar.date, close: bar.close })),
    ]),
  );
  tradingview.SPY[0].close *= 2;
  const result = await runDualMomentumBacktest({
    now: () => new Date("2022-06-30T22:00:00Z"),
    loadYahoo: async () => ({
      normalized: yahoo,
      rawSources: Object.fromEntries(Object.keys(yahoo).map((symbol) => [
        symbol, { url: "fixture:" + symbol, payload: { symbol } },
      ])),
    }),
    loadTradingView: async () => tradingview,
    publish: (bundle) => {
      diagnostic = bundle;
      return { directory: "/tmp/unverified" };
    },
  });
  assert.equal(result.bundle.qualification.status, "UNVERIFIED");
  assert.match(result.bundle.quality.error, /TradingView close mismatch/);
});
~~~

- [ ] **Step 2: 运行编排测试并确认失败**

Run: <code>node --test tests/dual-momentum/runner.test.mjs</code>

Expected: FAIL，缺少 <code>run_dual_momentum_backtest.mjs</code>。

- [ ] **Step 3: 实现回测编排函数**

~~~javascript
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COST_PROFILE_NAMES,
  DATA_START,
  DEVELOPMENT_END,
  DEVELOPMENT_EVALUATION_START,
  SYMBOLS,
} from "../src/dual-momentum/config.mjs";
import { COST_PROFILES } from "../src/dual-momentum/costs.mjs";
import {
  buildDataManifest,
  DataQualityError,
  validateDataBundle,
} from "../src/dual-momentum/data.mjs";
import { computeMetrics, evaluateQualification } from "../src/dual-momentum/metrics.mjs";
import { backtestPortfolio, hypotheticalLiquidation } from "../src/dual-momentum/portfolio.mjs";
import { publishReport } from "../src/dual-momentum/report.mjs";
import {
  buildDualMomentumSignals,
  buildMonthlySmaSignals,
  buildSma200Signals,
} from "../src/dual-momentum/signals.mjs";
import { loadTradingViewBars } from "../src/dual-momentum/tradingview.mjs";
import {
  fetchYahooChart,
  normalizeYahooSeries,
  parseYahooChart,
  retainCompletedSessions,
} from "../src/dual-momentum/yahoo.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function nextIsoDate(date) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function defaultLoadYahoo({ asOf, now, fetchImpl = fetch }) {
  const normalized = {};
  const rawSources = {};
  await Promise.all(Object.entries(SYMBOLS).map(async ([key, identity]) => {
    const source = await fetchYahooChart(identity.yahoo, {
      start: DATA_START,
      endExclusive: nextIsoDate(asOf),
      fetchImpl,
    });
    rawSources[key] = source;
    normalized[key] = retainCompletedSessions(
      normalizeYahooSeries(parseYahooChart(source.payload, identity.yahoo)),
      now,
    );
    const cacheDirectory = path.join(projectRoot, "data", "cache", "dual-momentum");
    mkdirSync(cacheDirectory, { recursive: true });
    writeFileSync(
      path.join(cacheDirectory, key + "-" + asOf + ".json"),
      JSON.stringify(source.payload),
      "utf8",
    );
  }));
  return { normalized, rawSources };
}

function defaultRunTv(args) {
  const cli = process.env.TV_CLI ??
    "/home/jingtianyu/projects/tradingview-mcp/src/cli/index.js";
  return JSON.parse(execFileSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 30_000,
  }));
}

function benchmarkSignals(signalDate = "2021-12-31") {
  return [{ signalDate, target: "SPY" }];
}

function packageResult(backtest, seriesBySymbol, profile) {
  const metrics = computeMetrics(backtest);
  return {
    metrics: { ...metrics, equity: undefined },
    trades: backtest.trades,
    equity: metrics.equity,
    liquidation: hypotheticalLiquidation(backtest, seriesBySymbol, profile),
  };
}
~~~

- [ ] **Step 4: 完成三策略、三成本和资格汇总**

把以下导出追加到同一文件：

~~~javascript
export async function runDualMomentumBacktest(options = {}) {
  const now = options.now?.() ?? new Date();
  const asOf = now.toISOString().slice(0, 10);
  const loadYahoo = options.loadYahoo ?? defaultLoadYahoo;
  const loadTradingView = options.loadTradingView ??
    (() => loadTradingViewBars(
      Object.fromEntries(Object.entries(SYMBOLS).map(
        ([key, value]) => [key, value.tradingview],
      )),
      defaultRunTv,
      { now },
    ));
  const publish = options.publish ?? ((bundle) => publishReport(bundle, {
    outputRoot: path.join(projectRoot, "docs", "backtests"),
    runDate: asOf,
  }));
  const { normalized, rawSources } = await loadYahoo({ asOf, now });
  const tradingview = await loadTradingView();
  const dataManifest = buildDataManifest(rawSources, normalized, now);
  let quality;
  try {
    quality = validateDataBundle({ yahoo: normalized, tradingview, now });
  } catch (error) {
    if (!(error instanceof DataQualityError)) throw error;
    const bundle = {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      period: {
        start: "2022-01-03",
        end: normalized.SPY.bars.at(-1).date,
      },
      config: { symbols: SYMBOLS, dataStart: DATA_START, costProfiles: COST_PROFILES },
      quality: { verified: false, error: error.message },
      dataManifest,
      strategies: {},
      qualification: {
        status: "UNVERIFIED",
        profiles: {},
        reason: error.message,
      },
    };
    return { bundle, output: publish(bundle) };
  }
  const signalSets = {
    dual_momentum: buildDualMomentumSignals(normalized),
    sma_200: buildSma200Signals(normalized.SPY),
    sma_10m: buildMonthlySmaSignals(normalized.SPY),
    spy_buy_hold: benchmarkSignals(),
  };
  const strategies = {};
  for (const [strategyName, signals] of Object.entries(signalSets)) {
    strategies[strategyName] = {};
    for (const profileName of COST_PROFILE_NAMES) {
      const profile = COST_PROFILES[profileName];
      const backtest = backtestPortfolio({
        seriesBySymbol: normalized,
        signals,
        costProfile: profile,
      });
      strategies[strategyName][profileName] =
        packageResult(backtest, normalized, profile);
    }
  }
  const qualification = evaluateQualification({
    strategy: Object.fromEntries(COST_PROFILE_NAMES.map((name) => [
      name, strategies.dual_momentum[name].metrics,
    ])),
    benchmark: Object.fromEntries(COST_PROFILE_NAMES.map((name) => [
      name, strategies.spy_buy_hold[name].metrics,
    ])),
    dataVerified: quality.verified,
  });
  const developmentProfile = COST_PROFILES.zero_cost;
  // 2008 is retained as warm-up; 2009-02-02 is the first executable 12M signal.
  const developmentDual = backtestPortfolio({
    seriesBySymbol: normalized,
    signals: signalSets.dual_momentum,
    costProfile: developmentProfile,
    startDate: DEVELOPMENT_EVALUATION_START,
    endDate: DEVELOPMENT_END,
  });
  const developmentSpy = backtestPortfolio({
    seriesBySymbol: normalized,
    signals: benchmarkSignals("2009-01-30"),
    costProfile: developmentProfile,
    startDate: DEVELOPMENT_EVALUATION_START,
    endDate: DEVELOPMENT_END,
  });
  const bundle = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    period: {
      start: strategies.dual_momentum.zero_cost.metrics.startDate,
      end: quality.latestCommonDate,
    },
    config: {
      symbols: SYMBOLS,
      dataStart: DATA_START,
      costProfiles: COST_PROFILES,
    },
    quality,
    dataManifest,
    signals: signalSets,
    developmentSanity: {
      period: {
        start: DEVELOPMENT_EVALUATION_START,
        end: DEVELOPMENT_END,
      },
      costProfile: "zero_cost",
      dualMomentum:
        packageResult(developmentDual, normalized, developmentProfile).metrics,
      spyBuyHold:
        packageResult(developmentSpy, normalized, developmentProfile).metrics,
      selectionUsed: false,
    },
    strategies,
    qualification,
  };
  return { bundle, output: publish(bundle) };
}
~~~

- [ ] **Step 5: 实现命令行入口和退出语义**

把以下代码放在文件末尾：

~~~javascript
const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  runDualMomentumBacktest()
    .then(({ bundle, output }) => {
      process.stdout.write(JSON.stringify({
        status: bundle.qualification.status,
        period: bundle.period,
        output: output.directory,
      }) + "\n");
      if (bundle.qualification.status === "UNVERIFIED") process.exitCode = 2;
    })
    .catch((error) => {
      process.stderr.write(error.stack + "\n");
      process.exitCode = 1;
    });
}
~~~

- [ ] **Step 6: 运行编排测试和全部专项测试**

Run: <code>node --test tests/dual-momentum/runner.test.mjs</code>

Expected: PASS，2 tests，0 fail。

Run: <code>npm run test:dual-momentum</code>

Expected: 所有双动量测试 PASS，0 fail。

- [ ] **Step 7: 提交端到端编排**

先在 <code>package.json</code> scripts 中增加：

~~~json
"backtest:dual-momentum": "node scripts/run_dual_momentum_backtest.mjs"
~~~

~~~bash
git add package.json scripts/run_dual_momentum_backtest.mjs tests/dual-momentum/runner.test.mjs
git commit -m "feat: add end-to-end dual-momentum backtest command"
~~~

### Task 11: TradingView 非重绘伴随指标

**Files:**
- Create: <code>indicators/spy_qqq_bil_dual_momentum_v1.pine</code>
- Create: <code>tests/dual-momentum/pine_static.test.mjs</code>

- [ ] **Step 1: 写 Pine 静态契约测试**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL(
    "../../indicators/spy_qqq_bil_dual_momentum_v1.pine",
    import.meta.url,
  ),
  "utf8",
);

test("declares a signal-only Pine v6 indicator for the fixed universe", () => {
  assert.match(source, /^\/\/@version=6$/m);
  assert.match(source, /indicator\(/);
  assert.doesNotMatch(source, /strategy\./);
  assert.match(source, /AMEX:SPY/);
  assert.match(source, /NASDAQ:QQQ/);
  assert.match(source, /AMEX:BIL/);
});

test("uses only prior completed monthly bars and exposes alerts", () => {
  assert.match(source, /request\.security/);
  assert.match(source, /ticker\.modify/);
  assert.match(source, /adjustment\s*=\s*adjustment\.dividends/);
  assert.match(source, /close\[1\]\s*\/\s*close\[13\]/);
  assert.match(source, /lookahead\s*=\s*barmerge\.lookahead_on/);
  assert.match(source, /timeframe\.change\(\s*"1M"\s*\)/);
  assert.match(source, /alertcondition/);
  assert.doesNotMatch(source, /lookahead_off/);
});
~~~

- [ ] **Step 2: 运行 Pine 测试并确认文件不存在**

Run: <code>node --test tests/dual-momentum/pine_static.test.mjs</code>

Expected: FAIL，错误为 <code>ENOENT</code>。

- [ ] **Step 3: 实现信号伴随指标**

~~~pine
//@version=6
indicator("SPY QQQ BIL Dual Momentum v1", overlay = false)

const string SPY = "AMEX:SPY"
const string QQQ = "NASDAQ:QQQ"
const string BIL = "AMEX:BIL"

string spyTicker = ticker.modify(
    SPY, session = session.regular, adjustment = adjustment.dividends)
string qqqTicker = ticker.modify(
    QQQ, session = session.regular, adjustment = adjustment.dividends)
string bilTicker = ticker.modify(
    BIL, session = session.regular, adjustment = adjustment.dividends)

float spy12 = request.security(
    spyTicker, "1M", close[1] / close[13] - 1.0,
    gaps = barmerge.gaps_off, lookahead = barmerge.lookahead_on)
float qqq12 = request.security(
    qqqTicker, "1M", close[1] / close[13] - 1.0,
    gaps = barmerge.gaps_off, lookahead = barmerge.lookahead_on)
float bil12 = request.security(
    bilTicker, "1M", close[1] / close[13] - 1.0,
    gaps = barmerge.gaps_off, lookahead = barmerge.lookahead_on)

string winner = spy12 >= qqq12 ? "SPY" : "QQQ"
float winnerReturn = winner == "SPY" ? spy12 : qqq12
string target = winnerReturn > bil12 ? winner : "BIL"
bool newMonth = timeframe.change("1M")
bool switched = newMonth and target != target[1]

plot(spy12 * 100.0, "SPY 12M", color = color.blue)
plot(qqq12 * 100.0, "QQQ 12M", color = color.purple)
plot(bil12 * 100.0, "BIL 12M", color = color.orange)
hline(0.0, "Zero", color = color.gray)

var table status = table.new(position.top_right, 2, 4, border_width = 1)
if barstate.islast
    table.cell(status, 0, 0, "Target")
    table.cell(status, 1, 0, target)
    table.cell(status, 0, 1, "SPY 12M")
    table.cell(status, 1, 1, str.tostring(spy12 * 100.0, "#.##") + "%")
    table.cell(status, 0, 2, "QQQ 12M")
    table.cell(status, 1, 2, str.tostring(qqq12 * 100.0, "#.##") + "%")
    table.cell(status, 0, 3, "BIL 12M")
    table.cell(status, 1, 3, str.tostring(bil12 * 100.0, "#.##") + "%")

alertcondition(switched, "Dual momentum target changed",
    "Dual momentum target changed. Open the indicator table for the confirmed target.")
~~~

- [ ] **Step 4: 运行 Pine 静态测试**

Run: <code>node --test tests/dual-momentum/pine_static.test.mjs</code>

Expected: PASS，2 tests，0 fail。

- [ ] **Step 5: 在 TradingView 可用时编译，登录墙必须如实记录**

Run:

~~~bash
TV_CLI=/home/jingtianyu/.config/superpowers/worktrees/tradingview-mcp/fix-symbol-info-null/src/cli/index.js
node "$TV_CLI" pine set --file indicators/spy_qqq_bil_dual_momentum_v1.pine
node "$TV_CLI" pine compile
~~~

Expected: <code>success: true</code>、<code>has_errors: false</code>、空错误数组。若页面返回 Join/Login，不修改测试结果为成功；在最终报告中写明 Pine 编译因登录墙未验证，本地组合回测不受影响。

- [ ] **Step 6: 提交 Pine 指标**

先把 <code>package.json</code> 的 <code>test:pine</code> 更新为：

~~~json
"test:pine": "node --test tests/spy_sma_atr_trend_static.test.mjs tests/dual-momentum/pine_static.test.mjs"
~~~

~~~bash
git add package.json indicators/spy_qqq_bil_dual_momentum_v1.pine tests/dual-momentum/pine_static.test.mjs
git commit -m "feat: add TradingView dual-momentum companion"
~~~

### Task 12: 真实数据运行、审计和最终报告

**Files:**
- Create: <code>docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum/metrics.json</code>
- Create: <code>docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum/trades.csv</code>
- Create: <code>docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum/equity.csv</code>
- Create: <code>docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum/data-manifest.json</code>
- Create: <code>docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum/summary.md</code>
- Create: <code>docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum/report.html</code>

- [ ] **Step 1: 运行完整自动测试**

Run: <code>npm test</code>

Expected: 既有 28 项测试和全部新增双动量测试均 PASS，0 fail、0 skipped。

- [ ] **Step 2: 执行 2022 至最新完整交易日回测**

Run:

~~~bash
TV_CLI=/home/jingtianyu/.config/superpowers/worktrees/tradingview-mcp/fix-symbol-info-null/src/cli/index.js npm run backtest:dual-momentum
~~~

Expected: 进程输出一行 JSON；<code>period.start</code> 为 <code>2022-01-03</code>，<code>period.end</code> 为三个标的共同的最新完整交易日，<code>status</code> 只能是 <code>PASS</code>、<code>FAIL</code> 或 <code>UNVERIFIED</code>。

- [ ] **Step 3: 审计数据门禁和结构化资格字段**

Run:

~~~bash
node -e 'const fs=require("fs");const p="docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum/metrics.json";const d=JSON.parse(fs.readFileSync(p));console.log(JSON.stringify({period:d.period,quality:d.quality,qualification:d.qualification},null,2))'
~~~

Expected:

- <code>quality.verified</code> 为 true 才允许 PASS 或 FAIL；
- 三个源都有 64 位 SHA-256；
- Webull 和 Robinhood 各有独立 <code>returnPassed</code> 与 <code>drawdownPassed</code>；
- 若数据不一致，状态必须为 UNVERIFIED，不能声称跑赢。

若状态为 <code>UNVERIFIED</code>，记录诊断原因并跳过只适用于有效指标的 Step 4 和 Step 5，然后继续 Step 6 保存诊断报告；不得把空策略集合交给复算器。

- [ ] **Step 4: 独立抽查交易和权益**

Run:

~~~bash
node scripts/verify_dual_momentum_report.mjs docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum
node -e 'const fs=require("fs");const root="docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum";const d=JSON.parse(fs.readFileSync(root+"/metrics.json"));const signals=d.signals.dual_momentum.filter(x=>x.signalDate>="2021-12-31");console.log(JSON.stringify(signals.slice(0,2),null,2));const rows=fs.readFileSync(root+"/trades.csv","utf8").trim().split(/\r?\n/);console.log(rows.slice(0,7).join("\n"));console.log(rows.filter(r=>r.includes(",BIL,")).slice(0,3).join("\n"))'
~~~

Expected: 第一条命令输出 <code>{"verified":true,"seriesChecked":12,"tradesChecked":...,"tolerance":0.0001}</code>。第二条命令显示至少两个已冻结信号月、最早交易和至少一次 BIL 交易；若样本外没有 BIL 持仓，记录“样本外无 BIL 持仓”，不得构造记录。

独立复算器必须验证：

1. 信号日必须早于成交日；
2. 成交日必须是下一共同交易日；
3. 每次换标的必须先 sell 后 buy；
4. 买入名义金额不得超过成交前权益的 95%；
5. 同标的连续持有期间没有为了恢复 95% 而产生的交易。
6. 每个策略和成本组合的累计收益与最大回撤同 <code>metrics.json</code> 的差异小于 0.01 个百分点。

- [ ] **Step 5: 核对四种策略、三种成本和报告一致性**

Run:

~~~bash
node -e 'const fs=require("fs");const p="docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum/metrics.json";const d=JSON.parse(fs.readFileSync(p));for(const [s,ps] of Object.entries(d.strategies)){for(const [p,r] of Object.entries(ps)){console.log(s,p,r.metrics.totalReturn,r.metrics.maxDrawdown)}}'
~~~

Expected: 恰好输出双动量、200 日均线、10 月均线和 SPY 买入持有，每种都包含 zero_cost、webull_current、robinhood_current。

确认 <code>summary.md</code>、<code>report.html</code> 和 <code>metrics.json</code> 的结论状态、起止日期、双动量收益、SPY 收益及最大回撤完全一致。

- [ ] **Step 6: 运行完成前验证并提交正式结果**

Run:

~~~bash
git diff --check
npm test
git status --short
~~~

Expected: 无空白错误；全部测试通过；状态只包含本计划声明的源码、测试和报告文件。

~~~bash
git add package.json .gitignore src/dual-momentum scripts/run_dual_momentum_backtest.mjs tests/dual-momentum indicators/spy_qqq_bil_dual_momentum_v1.pine docs/backtests/2026-08-30-spy-qqq-bil-dual-momentum
git commit -m "report: complete out-of-sample dual-momentum backtest"
~~~

- [ ] **Step 7: 验证私有远端并备份完成分支**

Run:

~~~bash
git remote get-url origin
gh repo view Jimmyyu725/tradingview-strategies --json visibility,nameWithOwner,url
git push origin feature/spy-sma-atr
git rev-parse HEAD
git ls-remote origin refs/heads/feature/spy-sma-atr
~~~

Expected: 远端精确对应 <code>Jimmyyu725/tradingview-strategies</code>，可见性为 <code>PRIVATE</code>；最后两个提交哈希完全一致。若无法验证私有性，不执行 push。

- [ ] **Step 8: 最终结论规则**

- 只有资格字段为 PASS，且独立复算和全部测试通过，才向用户明确报告“2022 年至今跑赢大盘”。
- 资格字段为 FAIL 时，先给出“没有通过”的结论，再列出差多少收益或哪项回撤失败；不得改参数重跑。
- 状态为 UNVERIFIED 时，只报告数据或外部工具门禁失败，不提供通过/失败投资结论。
- 无论结果如何，都不得登录 Webull/Robinhood、连接交易 API 或提交任何订单。

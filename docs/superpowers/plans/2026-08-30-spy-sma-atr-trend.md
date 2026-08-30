# SPY 双均线 ATR 趋势策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建、部署并验证一个 SPY 日线 Pine Script v6 双均线趋势策略，使用只上移的 `2 × ATR(14)` 止损，并生成 2022 年至今的可审计回测报告。

**Architecture:** 本地 Pine 文件是唯一事实来源；Node.js 内置测试先验证源码中的关键回测契约，再由 TradingView 官方编译器验证语法。一个独立 Node.js 采集脚本通过现有 TradingView MCP CLI 配置图表、同步源码、编译策略并保存原始结果和中文报告，避免只在网页编辑器中留下不可追踪状态。

**Tech Stack:** Pine Script v6、Node.js 24 内置 `node:test`、TradingView Desktop、`tradingview-mcp` CLI、Git。

---

## 文件结构

- Create: `package.json` — 定义无第三方依赖的测试命令。
- Create: `tests/spy_sma_atr_trend_static.test.mjs` — 验证 Pine 源码的参数、信号、止损单调性和无未来数据契约。
- Create: `strategies/spy_sma_atr_trend_v1.pine` — 策略的唯一 Pine Script 源码。
- Create: `tests/run_tradingview_backtest.test.mjs` — 验证图表身份检查、Pine 表格解析和报告格式。
- Create: `scripts/run_tradingview_backtest.mjs` — 运行 TradingView 回测并保存证据。
- Create at runtime: `docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json` — MCP 返回的原始结构化证据。
- Create at runtime: `docs/backtests/2026-08-30-spy-sma-atr-trend-v1.md` — 面向用户的中文结果摘要。
- Modify: `README.md` — 补充运行、验证和安全边界说明。

## 参考资料

- Design: `docs/superpowers/specs/2026-08-30-spy-sma-atr-trend-design.md`
- TradingView strategy order semantics: `https://www.tradingview.com/pine-script-docs/faq/strategies/`
- TradingView strategy declaration: `https://www.tradingview.com/pine-script-docs/language/declaration-statements/`
- TradingView strategy concepts: `https://www.tradingview.com/pine-script-docs/concepts/strategies/`
- MCP CLI source: `/home/jingtianyu/projects/tradingview-mcp/src/cli/`

### Task 1: 用测试锁定 Pine 策略契约并实现策略

**Files:**
- Create: `package.json`
- Create: `tests/spy_sma_atr_trend_static.test.mjs`
- Create: `strategies/spy_sma_atr_trend_v1.pine`

- [ ] **Step 1: 创建测试入口**

Create `package.json`:

```json
{
  "name": "tradingview-strategies",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "test:pine": "node --test tests/spy_sma_atr_trend_static.test.mjs",
    "test:report": "node --test tests/run_tradingview_backtest.test.mjs"
  }
}
```

- [ ] **Step 2: 写入会失败的 Pine 契约测试**

Create `tests/spy_sma_atr_trend_static.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const strategyPath = new URL("../strategies/spy_sma_atr_trend_v1.pine", import.meta.url);

function source() {
  return readFileSync(strategyPath, "utf8");
}

test("declares the approved capital, sizing, cost, and execution settings", () => {
  const pine = source();
  assert.match(pine, /^\/\/@version=6/m);
  assert.match(pine, /initial_capital\s*=\s*100000/);
  assert.match(pine, /default_qty_type\s*=\s*strategy\.percent_of_equity/);
  assert.match(pine, /default_qty_value\s*=\s*95/);
  assert.match(pine, /pyramiding\s*=\s*0/);
  assert.match(pine, /commission_type\s*=\s*strategy\.commission\.percent/);
  assert.match(pine, /commission_value\s*=\s*0\.0011/);
  assert.match(pine, /slippage\s*=\s*1/);
  assert.match(pine, /process_orders_on_close\s*=\s*false/);
});

test("uses the approved SMA, ATR, start-date, and long-only signals", () => {
  const pine = source();
  assert.match(pine, /input\.int\(50,\s*"Fast SMA length"/);
  assert.match(pine, /input\.int\(200,\s*"Slow SMA length"/);
  assert.match(pine, /input\.int\(14,\s*"ATR length"/);
  assert.match(pine, /input\.float\(2\.0,\s*"ATR multiplier"/);
  assert.match(pine, /input\.time\(timestamp\("1 Jan 2022 00:00 \+0000"\)/);
  assert.match(pine, /preStartBarCount\s*<\s*slowLength/);
  assert.match(pine, /runtime\.error\("At least 200 pre-start daily bars are required\."\)/);
  assert.match(pine, /ta\.crossover\(fastSma,\s*slowSma\)/);
  assert.match(pine, /ta\.crossunder\(fastSma,\s*slowSma\)/);
  assert.match(pine, /strategy\.entry\("Long",\s*strategy\.long\)/);
  assert.doesNotMatch(pine, /strategy\.short/);
});

test("attaches an initial ATR stop and ratchets the price stop upward only", () => {
  const pine = source();
  assert.match(pine, /strategy\.exit\("ATR Stop",\s*"Long",\s*loss\s*=\s*initialStopTicks/);
  assert.match(pine, /candidateStop\s*=\s*close\s*-\s*atrMultiplier\s*\*\s*atr/);
  assert.match(pine, /trailStop\s*:=\s*na\(trailStop\)\s*\?\s*math\.max\(initialStop,\s*candidateStop\)\s*:\s*math\.max\(trailStop,\s*candidateStop\)/);
  assert.match(pine, /strategy\.exit\("ATR Stop",\s*"Long",\s*stop\s*=\s*trailStop/);
  assert.match(pine, /stopRegressionCount\s*\+=\s*1/);
});

test("closes on a death cross without leaving the competing stop order", () => {
  const pine = source();
  assert.match(pine, /strategy\.cancel\("ATR Stop"\)/);
  assert.match(pine, /strategy\.close\("Long",\s*comment\s*=\s*"Death Cross"\)/);
});

test("does not request higher-timeframe data or enable repaint-prone modes", () => {
  const pine = source();
  assert.doesNotMatch(pine, /request\.security/);
  assert.doesNotMatch(pine, /lookahead/);
  assert.match(pine, /calc_on_order_fills\s*=\s*false/);
  assert.match(pine, /calc_on_every_tick\s*=\s*false/);
});

test("publishes benchmark and stop-regression evidence in a chart table", () => {
  const pine = source();
  assert.match(pine, /"Strategy equity return"/);
  assert.match(pine, /"Buy & hold return"/);
  assert.match(pine, /"Excess return"/);
  assert.match(pine, /"Stop regressions"/);
});
```

- [ ] **Step 3: 运行测试并确认红灯**

Run:

```bash
npm test
```

Expected: FAIL with `ENOENT` for `strategies/spy_sma_atr_trend_v1.pine`.

- [ ] **Step 4: 写入最小完整 Pine 实现**

Create `strategies/spy_sma_atr_trend_v1.pine`:

```pine
//@version=6
strategy(
     "SPY SMA 50/200 + ATR Trend v1",
     overlay = true,
     initial_capital = 100000,
     currency = currency.USD,
     default_qty_type = strategy.percent_of_equity,
     default_qty_value = 95,
     pyramiding = 0,
     commission_type = strategy.commission.percent,
     commission_value = 0.0011,
     slippage = 1,
     process_orders_on_close = false,
     calc_on_order_fills = false,
     calc_on_every_tick = false,
     margin_long = 100,
     margin_short = 100)

const float INITIAL_CAPITAL = 100000.0
const float POSITION_FRACTION = 0.95
const float COMMISSION_PERCENT = 0.0011

int fastLength = input.int(50, "Fast SMA length", minval = 1)
int slowLength = input.int(200, "Slow SMA length", minval = 2)
int atrLength = input.int(14, "ATR length", minval = 1)
float atrMultiplier = input.float(2.0, "ATR multiplier", minval = 0.1, step = 0.1)
int startDate = input.time(timestamp("1 Jan 2022 00:00 +0000"), "Backtest start")

if barstate.isfirst and (syminfo.ticker != "SPY" or not timeframe.isdaily or timeframe.multiplier != 1)
    runtime.error("This strategy requires SPY on the 1D timeframe.")

float fastSma = ta.sma(close, fastLength)
float slowSma = ta.sma(close, slowLength)
float atr = ta.atr(atrLength)

bool indicatorsReady = not na(slowSma) and not na(atr)
bool inDateRange = time >= startDate
bool goldenCross = inDateRange and indicatorsReady and ta.crossover(fastSma, slowSma)
bool deathCross = inDateRange and indicatorsReady and ta.crossunder(fastSma, slowSma)

var float entryAtr = na
var float trailStop = na
var int stopRegressionCount = 0
var int preStartBarCount = 0

if time < startDate
    preStartBarCount += 1

if barstate.islast and preStartBarCount < slowLength
    runtime.error("At least 200 pre-start daily bars are required.")

bool enteredLong = strategy.position_size > 0 and strategy.position_size[1] <= 0
bool exitedLong = strategy.position_size == 0 and strategy.position_size[1] > 0

if exitedLong
    entryAtr := na
    trailStop := na

if goldenCross and strategy.position_size == 0
    entryAtr := atr
    float stopDistance = atrMultiplier * atr
    int initialStopTicks = int(math.max(1.0, math.round(stopDistance / syminfo.mintick)))
    strategy.entry("Long", strategy.long)
    strategy.exit("ATR Stop", "Long", loss = initialStopTicks, comment = "ATR Stop")

if strategy.position_size > 0
    float initialStop = strategy.position_avg_price - atrMultiplier * nz(entryAtr, atr)
    float candidateStop = close - atrMultiplier * atr
    float previousStop = trailStop
    trailStop := na(trailStop) ? math.max(initialStop, candidateStop) : math.max(trailStop, candidateStop)
    if not na(previousStop) and trailStop < previousStop
        stopRegressionCount += 1
    strategy.exit("ATR Stop", "Long", stop = trailStop, comment = "ATR Stop")

if deathCross and strategy.position_size > 0
    strategy.cancel("ATR Stop")
    strategy.close("Long", comment = "Death Cross")

var float benchmarkEntryPrice = na
if inDateRange and na(benchmarkEntryPrice)
    benchmarkEntryPrice := close + syminfo.mintick

float commissionRate = COMMISSION_PERCENT / 100.0
float deployedCapital = INITIAL_CAPITAL * POSITION_FRACTION
float idleCash = INITIAL_CAPITAL - deployedCapital
float benchmarkEntryCommission = deployedCapital * commissionRate
float benchmarkShares = not na(benchmarkEntryPrice) ? (deployedCapital - benchmarkEntryCommission) / benchmarkEntryPrice : na
float benchmarkExitPrice = close - syminfo.mintick
float benchmarkSaleValue = benchmarkShares * benchmarkExitPrice
float benchmarkExitCommission = benchmarkSaleValue * commissionRate
float benchmarkFinalEquity = idleCash + benchmarkSaleValue - benchmarkExitCommission
float benchmarkReturnPct = not na(benchmarkEntryPrice) ? (benchmarkFinalEquity / INITIAL_CAPITAL - 1.0) * 100.0 : na
float strategyEquityReturnPct = (strategy.equity / INITIAL_CAPITAL - 1.0) * 100.0
float excessReturnPct = strategyEquityReturnPct - benchmarkReturnPct

plot(fastSma, "SMA 50", color = color.new(color.blue, 0), linewidth = 2)
plot(slowSma, "SMA 200", color = color.new(color.orange, 0), linewidth = 2)
plot(strategy.position_size > 0 ? trailStop : na, "ATR trailing stop", color = color.red, linewidth = 2, style = plot.style_linebr)
plotshape(goldenCross, title = "Golden cross", style = shape.triangleup, location = location.belowbar, color = color.lime, size = size.tiny, text = "BUY")
plotshape(deathCross and strategy.position_size > 0, title = "Death cross", style = shape.triangledown, location = location.abovebar, color = color.red, size = size.tiny, text = "EXIT")
bgcolor(not inDateRange ? color.new(color.gray, 92) : na, title = "Pre-backtest period")

var table evidence = table.new(position.bottom_right, 2, 5, border_width = 1)
if barstate.islast
    table.cell(evidence, 0, 0, "Metric", text_color = color.white, bgcolor = color.gray)
    table.cell(evidence, 1, 0, "Value", text_color = color.white, bgcolor = color.gray)
    table.cell(evidence, 0, 1, "Strategy equity return")
    table.cell(evidence, 1, 1, str.tostring(strategyEquityReturnPct, "#.##") + "%")
    table.cell(evidence, 0, 2, "Buy & hold return")
    table.cell(evidence, 1, 2, str.tostring(benchmarkReturnPct, "#.##") + "%")
    table.cell(evidence, 0, 3, "Excess return")
    table.cell(evidence, 1, 3, str.tostring(excessReturnPct, "#.##") + "%")
    table.cell(evidence, 0, 4, "Stop regressions")
    table.cell(evidence, 1, 4, str.tostring(stopRegressionCount))
```

- [ ] **Step 5: 运行本地测试并确认绿灯**

Run:

```bash
npm test:pine
```

Expected: 6 tests PASS, 0 FAIL.

- [ ] **Step 6: 使用 TradingView 官方编译器做离线检查**

Run:

```bash
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js pine analyze --file strategies/spy_sma_atr_trend_v1.pine
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js pine check --file strategies/spy_sma_atr_trend_v1.pine
```

Expected: both commands return `"success": true`; the compile check returns no Pine errors.

- [ ] **Step 7: 提交策略与契约测试**

```bash
git status --short
git diff --check
git add package.json tests/spy_sma_atr_trend_static.test.mjs strategies/spy_sma_atr_trend_v1.pine
git diff --cached --stat
git commit -m "功能：增加SPY双均线ATR策略"
```

### Task 2: 用测试实现自动化回测采集与报告

**Files:**
- Create: `tests/run_tradingview_backtest.test.mjs`
- Create: `scripts/run_tradingview_backtest.mjs`

- [ ] **Step 1: 写入会失败的报告工具测试**

Create `tests/run_tradingview_backtest.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {
  benchmarkMetricFromTables,
  renderMarkdown,
  validateChart,
} from "../scripts/run_tradingview_backtest.mjs";

const validChart = {
  success: true,
  symbol: "SPY",
  full_name: "AMEX:SPY",
  exchange: "NYSE Arca",
  description: "SPDR S&P 500 ETF TRUST",
  resolution: "D",
};

test("accepts only the intended SPY daily chart", () => {
  assert.doesNotThrow(() => validateChart(validChart));
  assert.throws(
    () => validateChart({ ...validChart, symbol: "AAPL" }),
    /Expected SPY/,
  );
  assert.throws(
    () => validateChart({ ...validChart, resolution: "60" }),
    /Expected daily timeframe/,
  );
});

test("extracts named evidence values from TradingView Pine tables", () => {
  const tables = {
    studies: [{
      name: "SPY SMA 50/200 + ATR Trend v1",
      tables: [{
        rows: [
          "Metric | Value",
          "Strategy equity return | 8.25%",
          "Buy & hold return | 12.50%",
          "Excess return | -4.25%",
          "Stop regressions | 0",
        ],
      }],
    }],
  };

  assert.equal(benchmarkMetricFromTables(tables, "Buy & hold return"), 12.5);
  assert.equal(benchmarkMetricFromTables(tables, "Stop regressions"), 0);
  assert.equal(benchmarkMetricFromTables(tables, "Missing"), null);
});

test("renders a report with strategy, benchmark, and validation evidence", () => {
  const bundle = {
    generated_at: "2026-08-30T12:00:00.000Z",
    chart: validChart,
    period: { start: "2022-01-01", end: "2026-08-28" },
    compile: { success: true, has_errors: false, errors: [] },
    source_matches_editor: true,
    performance: {
      success: true,
      strategy: "SPY SMA 50/200 + ATR Trend v1",
      currency: "USD",
      metrics: {
        net_profit: 8250,
        net_profit_percent: 8.25,
        max_drawdown: 7100,
        max_drawdown_percent: 7.1,
        total_trades: 2,
        percent_profitable: 50,
        profit_factor: 1.4,
        avg_trade: 4125,
        commission_paid: 4.2,
        open_pl: 0,
      },
    },
    trades: { success: true, total_orders: 4, trades: [] },
    tables: {
      studies: [{
        tables: [{
          rows: [
            "Strategy equity return | 8.25%",
            "Buy & hold return | 12.50%",
            "Excess return | -4.25%",
            "Stop regressions | 0",
          ],
        }],
      }],
    },
  };

  const report = renderMarkdown(bundle);
  assert.match(report, /净收益率 \| 8\.25%/);
  assert.match(report, /买入持有收益率 \| 12\.50%/);
  assert.match(report, /超额收益 \| -4\.25%/);
  assert.match(report, /止损下移次数 \| 0/);
  assert.match(report, /没有连接券商或提交真实订单/);
});
```

- [ ] **Step 2: 运行报告测试并确认红灯**

Run:

```bash
npm test:report
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/run_tradingview_backtest.mjs`.

- [ ] **Step 3: 实现回测采集脚本**

Create `scripts/run_tradingview_backtest.mjs`:

```javascript
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = path.join(projectRoot, "strategies/spy_sma_atr_trend_v1.pine");
const outputDir = path.join(projectRoot, "docs/backtests");
const outputStem = "2026-08-30-spy-sma-atr-trend-v1";
const tvCli = process.env.TV_CLI
  ?? "/home/jingtianyu/projects/tradingview-mcp/src/cli/index.js";

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, suffix = "") {
  const number = numberOrNull(value);
  return number === null ? "不可用" : `${number.toFixed(2)}${suffix}`;
}

export function validateChart(chart) {
  const ticker = String(chart.symbol ?? "").split(":").at(-1);
  if (ticker !== "SPY") {
    throw new Error(`Expected SPY, received ${chart.symbol ?? "unknown"}`);
  }
  if (chart.resolution !== "D") {
    throw new Error(`Expected daily timeframe, received ${chart.resolution ?? "unknown"}`);
  }
  if (!/SPDR S&P 500 ETF TRUST/i.test(chart.description ?? "")) {
    throw new Error(`Expected SPDR S&P 500 ETF TRUST, received ${chart.description ?? "unknown"}`);
  }
  if (!/NYSE Arca/i.test(chart.exchange ?? "")) {
    throw new Error(`Expected NYSE Arca, received ${chart.exchange ?? "unknown"}`);
  }
}

export function benchmarkMetricFromTables(tables, label) {
  for (const study of tables?.studies ?? []) {
    for (const table of study.tables ?? []) {
      for (const row of table.rows ?? []) {
        const [rowLabel, rawValue] = row.split("|").map((part) => part.trim());
        if (rowLabel !== label) continue;
        const parsed = Number.parseFloat(rawValue.replace("%", ""));
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
  }
  return null;
}

export function renderMarkdown(bundle) {
  const metrics = bundle.performance.metrics;
  const strategyEquityReturn = benchmarkMetricFromTables(
    bundle.tables,
    "Strategy equity return",
  );
  const buyHoldReturn = benchmarkMetricFromTables(bundle.tables, "Buy & hold return")
    ?? numberOrNull(metrics.buy_hold_return);
  const excessReturn = benchmarkMetricFromTables(bundle.tables, "Excess return")
    ?? (
      strategyEquityReturn !== null && buyHoldReturn !== null
        ? strategyEquityReturn - buyHoldReturn
        : null
    );
  const stopRegressions = benchmarkMetricFromTables(bundle.tables, "Stop regressions");

  return `# SPY 双均线 ATR 趋势策略回测

## 结论数据

| 指标 | 结果 |
| --- | ---: |
| 回测区间 | ${bundle.period.start} 至 ${bundle.period.end} |
| 净利润 | ${formatNumber(metrics.net_profit, " USD")} |
| 净收益率 | ${formatNumber(metrics.net_profit_percent, "%")} |
| 策略权益收益率 | ${formatNumber(strategyEquityReturn, "%")} |
| 最大回撤 | ${formatNumber(metrics.max_drawdown_percent, "%")} |
| 总交易次数 | ${metrics.total_trades ?? "不可用"} |
| 胜率 | ${formatNumber(metrics.percent_profitable, "%")} |
| Profit Factor | ${formatNumber(metrics.profit_factor)} |
| 平均每笔交易收益 | ${formatNumber(metrics.avg_trade, " USD")} |
| 累计佣金 | ${formatNumber(metrics.commission_paid, " USD")} |
| 买入持有收益率 | ${formatNumber(buyHoldReturn, "%")} |
| 超额收益 | ${formatNumber(excessReturn, "%")} |
| 止损下移次数 | ${stopRegressions ?? "不可用"} |

## 验证证据

- 图表：${bundle.chart.full_name ?? bundle.chart.symbol}，${bundle.chart.resolution} 周期。
- Pine 编译错误：${bundle.compile.has_errors ? bundle.compile.errors.length : 0}。
- 本地源码与 Pine Editor：${bundle.source_matches_editor ? "一致" : "不一致"}。
- Strategy Tester 原始指标数量：${bundle.performance.metric_count ?? Object.keys(metrics).length}。
- Strategy Tester 订单数量：${bundle.trades.total_orders ?? 0}。

## 回测假设

- 初始资金 100,000 USD，每次使用 95% 权益，只做多，不加仓。
- 每次成交佣金 0.0011%，滑点 1 tick。
- 金叉与死叉信号在完整日线收盘后生成，市价单在下一根日线开盘成交。
- ATR 跟踪止损只能上移；运行证据中的“止损下移次数”必须为 0。
- 买入持有基准使用 95% 初始投入，并按相同佣金和滑点近似清算。
- 本次仅为历史研究，没有连接券商或提交真实订单。

## 可审计来源

- Pine 源码：\`strategies/spy_sma_atr_trend_v1.pine\`
- 原始 MCP 数据：\`docs/backtests/${outputStem}.json\`
- 生成时间：${bundle.generated_at}
`;
}

export function runTv(args) {
  const stdout = execFileSync(
    process.execPath,
    [tvCli, ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  return JSON.parse(stdout);
}

async function waitForStrategy(run, attempts = 10) {
  let lastResult = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastResult = run(["data", "strategy"]);
    if (lastResult.success) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Strategy Tester did not become ready: ${lastResult?.error ?? "unknown error"}`);
}

export async function executeBacktest(run = runTv) {
  const localSource = readFileSync(scriptPath, "utf8");

  run(["symbol", "SPY"]);
  run(["timeframe", "1D"]);
  const chart = run(["info"]);
  validateChart(chart);

  const sourceSet = run(["pine", "set", "--file", scriptPath]);
  if (!sourceSet.success) throw new Error("Pine source injection failed");

  const editor = run(["pine", "get"]);
  const sourceMatchesEditor = editor.source.trim() === localSource.trim();
  if (!sourceMatchesEditor) throw new Error("Pine Editor source differs from local source");

  const compile = run(["pine", "compile"]);
  if (!compile.success || compile.has_errors) {
    throw new Error(`Pine chart compilation failed: ${JSON.stringify(compile.errors)}`);
  }

  const performance = await waitForStrategy(run);
  const trades = run(["data", "trades", "--max", "100"]);
  const tables = run(["data", "tables", "--filter", "SPY SMA"]);
  const ohlcv = run(["ohlcv", "--count", "500"]);
  const lastBar = ohlcv.bars.at(-1);
  if (!lastBar) throw new Error("TradingView returned no OHLCV bars");

  const bundle = {
    generated_at: new Date().toISOString(),
    chart,
    period: {
      start: "2022-01-01",
      end: new Date(lastBar.time * 1000).toISOString().slice(0, 10),
    },
    compile,
    source_matches_editor: sourceMatchesEditor,
    performance,
    trades,
    tables,
    last_bar: lastBar,
  };

  const stopRegressions = benchmarkMetricFromTables(tables, "Stop regressions");
  if (stopRegressions !== 0) {
    throw new Error(`ATR stop moved downward ${stopRegressions ?? "an unknown number of"} times`);
  }

  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${outputStem}.json`);
  const markdownPath = path.join(outputDir, `${outputStem}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(bundle), "utf8");

  return { jsonPath, markdownPath, bundle };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  executeBacktest()
    .then(({ jsonPath, markdownPath, bundle }) => {
      console.log(JSON.stringify({
        success: true,
        json_path: jsonPath,
        markdown_path: markdownPath,
        metrics: bundle.performance.metrics,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
```

- [ ] **Step 4: 运行报告工具测试并确认绿灯**

Run:

```bash
npm test:report
```

Expected: 3 tests PASS, 0 FAIL.

- [ ] **Step 5: 运行全部本地测试**

Run:

```bash
npm test
```

Expected: 9 tests PASS, 0 FAIL.

- [ ] **Step 6: 提交回测采集工具**

```bash
git status --short
git diff --check
git add tests/run_tradingview_backtest.test.mjs scripts/run_tradingview_backtest.mjs
git diff --cached --stat
git commit -m "功能：增加TradingView回测采集报告"
```

### Task 3: 部署到 TradingView 并生成历史回测

**Files:**
- Create: `docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json`
- Create: `docs/backtests/2026-08-30-spy-sma-atr-trend-v1.md`

- [ ] **Step 1: 确认 TradingView 与 MCP 服务健康**

Run:

```bash
systemctl --user is-active tradingview-xvfb.service
systemctl --user is-active tradingview-mcp-app.service
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js status
```

Expected: both services print `active`; status returns `"success": true`, `"cdp_connected": true`, and `"api_available": true`.

- [ ] **Step 2: 再次运行 Pine 静态和官方编译检查**

Run:

```bash
npm test:pine
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js pine analyze --file strategies/spy_sma_atr_trend_v1.pine
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js pine check --file strategies/spy_sma_atr_trend_v1.pine
```

Expected: local tests pass; both Pine checks return success with no compiler errors.

- [ ] **Step 3: 执行端到端回测采集**

Run:

```bash
node scripts/run_tradingview_backtest.mjs
```

Expected: JSON output contains `"success": true` and exact paths for both backtest files. The script must stop instead of writing files if the chart is not NYSE Arca SPY daily, the editor source differs, compilation fails, Strategy Tester is unavailable, or the stop regression count is not zero.

- [ ] **Step 4: 验证结构化结果完整**

Run:

```bash
jq '{chart,period,compile,source_matches_editor,metric_count:.performance.metric_count,total_orders:.trades.total_orders,last_bar}' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json
jq -e '.chart.symbol | endswith("SPY")' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json
jq -e '.chart.resolution == "D"' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json
jq -e '.compile.has_errors == false' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json
jq -e '.source_matches_editor == true' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json
jq -e '.performance.metric_count > 0' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json
```

Expected: every `jq -e` exits 0; the summary shows SPY, daily resolution, no compile errors, matching source, at least one metric, and an explicit last-bar date source.

- [ ] **Step 5: 检查报告没有虚构或缺失数据**

Run:

```bash
rg -n '不可用|NaN|Infinity' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.md
sed -n '1,220p' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.md
```

Expected: `rg` returns no matches. Read the entire report and confirm every number is present in the JSON evidence or the Pine evidence table.

- [ ] **Step 6: 抽查交易语义**

Run:

```bash
jq '.trades | {success,total_orders,trades}' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json
jq -r '.tables.studies[].tables[].rows[]' docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json
```

Expected: entry and exit orders are chronologically coherent; `Stop regressions | 0` is present. If the 2022-to-current interval contains no death-cross exit or no ATR-stop exit, add a factual sentence to the Markdown report identifying the absent exit type; do not synthesize a trade.

- [ ] **Step 7: 提交回测证据**

```bash
git status --short
git diff --check
git add docs/backtests/2026-08-30-spy-sma-atr-trend-v1.json docs/backtests/2026-08-30-spy-sma-atr-trend-v1.md
git diff --cached --stat
git commit -m "回测：记录SPY趋势策略历史结果"
```

### Task 4: 更新项目说明并完成最终验证

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

Replace `README.md` with:

```markdown
# TradingView 策略回测

用于保存、验证和比较 TradingView Pine Script 策略及其历史回测结果。

## 当前策略

- `strategies/spy_sma_atr_trend_v1.pine`：SPY 日线 SMA(50/200) 金叉入场，死叉或只上移的 `2 × ATR(14)` 止损退出。
- 回测范围：2022-01-01 至 TradingView 当前最后一根完整日线。
- 初始资金：100,000 USD；仓位 95%；佣金 0.0011%；滑点 1 tick。

## 验证

```bash
npm test
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js pine analyze --file strategies/spy_sma_atr_trend_v1.pine
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js pine check --file strategies/spy_sma_atr_trend_v1.pine
```

## 运行回测

TradingView Desktop 和本地 MCP 服务运行后执行：

```bash
node scripts/run_tradingview_backtest.mjs
```

结果保存在 `docs/backtests/`。本项目只用于历史研究，不连接券商或提交真实订单。

## 目录

- `strategies/`：Pine Script 策略源码
- `tests/`：策略契约和报告工具测试
- `scripts/`：TradingView 回测采集工具
- `docs/superpowers/specs/`：已确认的设计规范
- `docs/superpowers/plans/`：实施计划
- `docs/backtests/`：结构化结果和中文摘要
```

- [ ] **Step 2: 运行完整验证**

Run:

```bash
npm test
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js pine analyze --file strategies/spy_sma_atr_trend_v1.pine
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js pine check --file strategies/spy_sma_atr_trend_v1.pine
node /home/jingtianyu/projects/tradingview-mcp/src/cli/index.js data strategy
git diff --check
```

Expected: 9 local tests pass; both Pine checks succeed; live strategy results contain metrics; `git diff --check` prints nothing.

- [ ] **Step 3: 提交文档更新**

```bash
git add README.md
git diff --cached --stat
git commit -m "文档：说明策略回测与验证流程"
```

- [ ] **Step 4: 推送前验证私有仓库并备份**

Run:

```bash
git remote get-url origin
gh repo view Jimmyyu725/tradingview-strategies --json visibility,nameWithOwner,url
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
git status --short --branch
```

Expected: GitHub reports `"visibility":"PRIVATE"`; local HEAD equals the hash returned for remote `refs/heads/main`; status is clean and `main` is aligned with `origin/main`.

## 完成条件

- 本地源码、Pine Editor 和图表策略三者一致。
- 9 个本地测试、离线分析和 TradingView 官方编译检查全部通过。
- Strategy Tester 返回真实指标与订单数据。
- 报告包含策略结果、同口径买入持有基准和零止损回退证据。
- 没有券商登录、实盘连接或订单提交。
- 所有提交已推送到再次验证为 `PRIVATE` 的 GitHub 仓库，且本地与远程提交一致。

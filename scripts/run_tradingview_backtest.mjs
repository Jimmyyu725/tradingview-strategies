import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(
  projectRoot,
  "strategies",
  "spy_sma_atr_trend_v1.pine",
);
const outputDirectory = path.join(projectRoot, "docs", "backtests");
const outputStem = "2026-08-30-spy-sma-atr-trend-v1";
export const EXPECTED_STRATEGY_NAME = "SPY SMA 50/200 + ATR Trend v1";
const tvCli =
  process.env.TV_CLI ??
  "/home/jingtianyu/projects/tradingview-mcp/src/cli/index.js";
const numericTextPattern =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const expectedStrategyInputs = [
  {
    key: "fast_sma_length",
    name: "fastLength",
    title: "Fast SMA length",
    id: "in_0",
    value: 50,
  },
  {
    key: "slow_sma_length",
    name: "slowLength",
    title: "Slow SMA length",
    id: "in_1",
    value: 200,
  },
  {
    key: "atr_length",
    name: "atrLength",
    title: "ATR length",
    id: "in_2",
    value: 14,
  },
  {
    key: "atr_multiplier",
    name: "atrMultiplier",
    title: "ATR multiplier",
    id: "in_3",
    value: 2,
  },
  {
    key: "backtest_start",
    name: "startDate",
    title: "Backtest start",
    id: "in_4",
  },
];
const expectedBacktestStart = "2022-01-01T00:00:00.000Z";
const requiredPerformanceMetrics = [
  "net_profit",
  "net_profit_percent",
  "max_drawdown",
  "max_drawdown_percent",
  "total_trades",
  "percent_profitable",
  "profit_factor",
  "avg_trade",
  "commission_paid",
  "open_pl",
];
const tradeLimit = 20;
const addToChartActions = new Set([
  "Add to chart",
  "Save and add to chart",
]);
const allowedCompileActions = new Set([
  "Update on chart",
  ...addToChartActions,
]);

function numberOrNull(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const numericText = value.trim();
  if (!numericTextPattern.test(numericText)) return null;
  const number = Number(numericText);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  const number = numberOrNull(value);
  return number === null ? "不可用" : number.toFixed(2);
}

function formatPercent(value) {
  const number = numberOrNull(value);
  return number === null ? "不可用" : `${formatNumber(number)}%`;
}

function requireSuccess(result, action) {
  if (!result?.success) {
    throw new Error(`${action} failed: ${result?.error ?? "unknown error"}`);
  }
  return result;
}

function barDate(time) {
  const timestamp = numberOrNull(time);
  if (timestamp === null) throw new Error("Last OHLCV bar has an invalid time.");
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Last OHLCV bar has an invalid time.");
  }
  return date.toISOString().slice(0, 10);
}

export function validateChart(chart) {
  requireSuccess(chart, "Chart info");
  if (chart.symbol !== "SPY") {
    throw new Error(`Expected SPY ticker, received ${chart.symbol ?? "missing"}.`);
  }
  if (chart.full_name !== "AMEX:SPY") {
    throw new Error(
      `Expected AMEX:SPY full name, received ${chart.full_name ?? "missing"}.`,
    );
  }
  if (chart.resolution !== "D") {
    throw new Error(
      `Expected daily timeframe D, received ${chart.resolution ?? "missing"}.`,
    );
  }
  if (chart.description !== "SPDR S&P 500 ETF TRUST") {
    throw new Error(
      "Expected SPDR S&P 500 ETF TRUST chart description.",
    );
  }
  if (chart.exchange !== "NYSE Arca") {
    throw new Error(
      `Expected NYSE Arca exchange, received ${chart.exchange ?? "missing"}.`,
    );
  }
}

export function validateCompile(compile) {
  if (compile?.success !== true) {
    throw new Error("Pine compile success must be true.");
  }
  if (compile.has_errors !== false) {
    throw new Error("Pine compile has_errors must be false.");
  }
  if (!Array.isArray(compile.errors) || compile.errors.length !== 0) {
    throw new Error("Pine compile errors must be an empty array.");
  }
  if (
    compile.error_count !== undefined &&
    (!Number.isInteger(compile.error_count) || compile.error_count !== 0)
  ) {
    throw new Error("Pine compile error_count must be 0 when provided.");
  }
  if (!allowedCompileActions.has(compile.button_clicked)) {
    throw new Error(
      "Pine compile button_clicked must place Pine source on the chart.",
    );
  }
  const expectedStudyAdded = addToChartActions.has(compile.button_clicked);
  if (compile.study_added !== expectedStudyAdded) {
    throw new Error(
      `Pine compile study_added must be ${expectedStudyAdded} for ${compile.button_clicked}.`,
    );
  }
  return compile;
}

function validateStateContext(state, label = "Strategy state") {
  if (state?.success !== true || !Array.isArray(state.studies)) {
    throw new Error(`${label} must be a successful response with studies.`);
  }
  if (
    state.symbol !== undefined &&
    state.symbol !== "AMEX:SPY" &&
    state.symbol !== "SPY"
  ) {
    throw new Error(`${label} symbol must be AMEX:SPY or SPY.`);
  }
  if (
    state.full_symbol !== undefined &&
    state.full_symbol !== "AMEX:SPY"
  ) {
    throw new Error(`${label} full_symbol must be AMEX:SPY.`);
  }
  if (state.symbol === undefined && state.full_symbol === undefined) {
    throw new Error(`${label} must identify the SPY symbol.`);
  }
  if (state.resolution !== "D") {
    throw new Error(`${label} resolution must be D.`);
  }
  return state;
}

function entityIdFromStudy(study) {
  const entityId = study?.id ?? study?.entity_id;
  return typeof entityId === "string" && entityId.trim() !== ""
    ? entityId
    : null;
}

function exactStrategyInstances(state, label) {
  const matches = state.studies.filter(
    (study) => study?.name === EXPECTED_STRATEGY_NAME,
  );
  return matches.map((study) => {
    const entityId = entityIdFromStudy(study);
    if (entityId === null) {
      throw new Error(`${label} exact strategy is missing an entity id.`);
    }
    return { ...study, entity_id: entityId };
  });
}

export function validateStrategyState(state) {
  validateStateContext(state);
  const matches = exactStrategyInstances(state, "Strategy state");
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one strategy instance named ${EXPECTED_STRATEGY_NAME}; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function stateEntityIds(state, label) {
  const ids = state.studies.map((study) => entityIdFromStudy(study));
  if (ids.some((entityId) => entityId === null)) {
    throw new Error(`${label} contains a study without an entity id.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} contains duplicate study entity ids.`);
  }
  return new Set(ids);
}

export function bindStrategyInstance(beforeState, afterState, compile) {
  validateCompile(compile);
  validateStateContext(beforeState, "Pre-compile strategy state");
  validateStateContext(afterState, "Post-compile strategy state");
  const beforeMatches = exactStrategyInstances(
    beforeState,
    "Pre-compile strategy state",
  );
  const afterMatches = exactStrategyInstances(
    afterState,
    "Post-compile strategy state",
  );

  if (compile.button_clicked === "Update on chart") {
    if (beforeMatches.length !== 1 || afterMatches.length !== 1) {
      throw new Error(
        "Update on chart requires exactly one strategy instance before and after compile.",
      );
    }
    if (beforeMatches[0].entity_id !== afterMatches[0].entity_id) {
      throw new Error(
        "Update on chart must preserve the bound strategy entity id.",
      );
    }
    return {
      ...afterMatches[0],
      compile_action: compile.button_clicked,
    };
  }

  if (afterMatches.length !== 1) {
    throw new Error(
      "Add to chart requires one exact strategy instance after compile.",
    );
  }
  const beforeIds = stateEntityIds(beforeState, "Pre-compile strategy state");
  const afterIds = stateEntityIds(afterState, "Post-compile strategy state");
  const newEntityIds = [...afterIds].filter(
    (entityId) => !beforeIds.has(entityId),
  );
  if (
    newEntityIds.length !== 1 ||
    newEntityIds[0] !== afterMatches[0].entity_id
  ) {
    throw new Error(
      "Add to chart must create exactly one new strategy entity.",
    );
  }
  return {
    ...afterMatches[0],
    compile_action: compile.button_clicked,
  };
}

function inputValue(input) {
  if (Object.hasOwn(input, "value")) return input.value;
  if (Object.hasOwn(input, "_value")) return input._value;
  return undefined;
}

function normalizeTimestamp(value, label) {
  const timestamp = numberOrNull(value);
  if (timestamp === null) throw new Error(`${label} must be a finite timestamp.`);
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a finite timestamp.`);
  }
  return date.toISOString();
}

export function validateStrategyInputs(indicator, expectedEntityId) {
  if (indicator?.success !== true || !Array.isArray(indicator.inputs)) {
    throw new Error("Cannot prove Pine input defaults from indicator response.");
  }
  if (
    expectedEntityId !== undefined &&
    indicator.entity_id !== expectedEntityId
  ) {
    throw new Error(
      `Indicator entity_id must match ${expectedEntityId}; received ${indicator.entity_id ?? "missing"}.`,
    );
  }
  const hasNamedInputs = indicator.inputs.some(
    (input) =>
      typeof input?.name === "string" || typeof input?.title === "string",
  );
  const values = new Map();

  for (const expected of expectedStrategyInputs) {
    const matches = indicator.inputs.filter((input) => {
      if (hasNamedInputs) {
        return [input?.name, input?.title].some(
          (label) => label === expected.name || label === expected.title,
        );
      }
      return input?.id === expected.id;
    });
    if (matches.length !== 1) {
      throw new Error(
        `Cannot prove Pine input defaults: expected one ${expected.title} input.`,
      );
    }
    values.set(expected.key, inputValue(matches[0]));
  }

  const normalized = {};
  for (const expected of expectedStrategyInputs.slice(0, 4)) {
    const actual = numberOrNull(values.get(expected.key));
    if (actual !== expected.value) {
      throw new Error(
        `${expected.title} must equal ${expected.value}; received ${values.get(expected.key)}.`,
      );
    }
    normalized[expected.key] = actual;
  }

  const start = normalizeTimestamp(
    values.get("backtest_start"),
    "Backtest start",
  );
  if (start !== expectedBacktestStart) {
    throw new Error(
      `Backtest start must equal ${expectedBacktestStart}; received ${start}.`,
    );
  }
  normalized.backtest_start = start;
  return normalized;
}

export function benchmarkMetricFromTables(tables, expectedLabel) {
  const matches = [];
  const studies = Array.isArray(tables?.studies) ? tables.studies : [];
  for (const study of studies) {
    const studyTables = Array.isArray(study?.tables) ? study.tables : [];
    for (const table of studyTables) {
      const rows = Array.isArray(table?.rows) ? table.rows : [];
      for (const row of rows) {
        if (typeof row !== "string") continue;
        const cells = row.split("|").map((cell) => cell.trim());
        if (cells[0] !== expectedLabel) continue;
        if (cells.length !== 2) {
          throw new Error(`Malformed table metric row: ${expectedLabel}.`);
        }
        matches.push(cells[1]);
      }
    }
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`Duplicate table metric: ${expectedLabel}.`);
  }

  const rawValue = matches[0];
  const returnLabels = new Set([
    "Strategy equity return",
    "Buy & hold return",
    "Excess return",
  ]);
  let numericText = rawValue;
  if (returnLabels.has(expectedLabel)) {
    if (!rawValue.endsWith("%")) {
      throw new Error(`${expectedLabel} must end with %.`);
    }
    numericText = rawValue.slice(0, -1).trim();
  } else if (expectedLabel === "Stop regressions" && rawValue.includes("%")) {
    throw new Error("Stop regressions must not include %.");
  }

  if (!numericTextPattern.test(numericText)) return null;
  const parsed = Number.parseFloat(numericText);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validatePerformance(performance) {
  if (performance?.success !== true) {
    throw new Error("Strategy performance success must be true.");
  }
  if (performance.strategy !== EXPECTED_STRATEGY_NAME) {
    throw new Error(
      `Unexpected performance strategy: ${performance.strategy ?? "missing"}.`,
    );
  }
  if (performance.currency !== "USD") {
    throw new Error("Strategy performance currency must be USD.");
  }
  if (
    !performance.metrics ||
    typeof performance.metrics !== "object" ||
    Array.isArray(performance.metrics)
  ) {
    throw new Error("Strategy performance metrics must be an object.");
  }
  for (const metric of requiredPerformanceMetrics) {
    if (!Object.hasOwn(performance.metrics, metric)) {
      throw new Error(`Missing required performance metric: ${metric}.`);
    }
    if (
      typeof performance.metrics[metric] !== "number" ||
      !Number.isFinite(performance.metrics[metric])
    ) {
      throw new Error(`Performance metric ${metric} must be finite.`);
    }
  }
  if (
    !Number.isInteger(performance.metrics.total_trades) ||
    performance.metrics.total_trades < 0
  ) {
    throw new Error("Performance metric total_trades must be non-negative.");
  }
  const actualMetricCount = Object.keys(performance.metrics).length;
  if (
    !Number.isInteger(performance.metric_count) ||
    performance.metric_count < requiredPerformanceMetrics.length ||
    performance.metric_count !== actualMetricCount
  ) {
    throw new Error(
      `Performance metric_count must equal the ${actualMetricCount} returned metrics.`,
    );
  }
  return performance;
}

export function validateTrades(
  trades,
  performanceTradeCount,
  maximumTrades = tradeLimit,
) {
  if (trades?.success !== true || !Array.isArray(trades.trades)) {
    throw new Error("Strategy trades must be a successful response with trades.");
  }
  if (!Number.isInteger(trades.total_orders) || trades.total_orders < 0) {
    throw new Error("Strategy total_orders must be a finite non-negative integer.");
  }
  if (!Number.isInteger(trades.trade_count) || trades.trade_count < 0) {
    throw new Error("Strategy trade_count must be a finite non-negative integer.");
  }
  if (!Number.isInteger(maximumTrades) || maximumTrades < 1) {
    throw new Error("Maximum returned trades must be a positive integer.");
  }
  if (trades.trade_count !== trades.trades.length) {
    throw new Error("Strategy trade_count must equal trades length.");
  }
  if (trades.total_orders < trades.trade_count) {
    throw new Error("Strategy total_orders must not be less than trade_count.");
  }
  if (trades.total_orders === 0 && performanceTradeCount !== 0) {
    throw new Error("Strategy zero orders contradicts total_trades.");
  }
  const expectedReturnedOrderCount = Math.min(
    trades.total_orders,
    maximumTrades,
  );
  if (trades.trade_count !== expectedReturnedOrderCount) {
    throw new Error(
      "Strategy trade_count must equal the expected returned order count.",
    );
  }
  return trades;
}

export function validateTables(tables) {
  if (
    tables?.success !== true ||
    tables.study_count !== 1 ||
    !Array.isArray(tables.studies) ||
    tables.studies.length !== 1 ||
    tables.studies[0]?.name !== EXPECTED_STRATEGY_NAME
  ) {
    throw new Error(
      `Expected one exact strategy study named ${EXPECTED_STRATEGY_NAME}.`,
    );
  }

  const labels = [
    ["strategy_equity_return", "Strategy equity return"],
    ["buy_hold_return", "Buy & hold return"],
    ["excess_return", "Excess return"],
    ["stop_regressions", "Stop regressions"],
  ];
  const evidence = {};
  for (const [key, label] of labels) {
    const value = benchmarkMetricFromTables(tables, label);
    if (value === null) {
      throw new Error(`Missing required table metric: ${label}.`);
    }
    evidence[key] = value;
  }
  if (evidence.stop_regressions !== 0) {
    throw new Error(
      `Expected Stop regressions to equal 0, received ${evidence.stop_regressions}.`,
    );
  }
  return evidence;
}

export function validateOhlcv(ohlcv) {
  if (ohlcv?.success !== true || !Array.isArray(ohlcv.bars)) {
    throw new Error("OHLCV must be a successful response with bars.");
  }
  if (!Number.isInteger(ohlcv.bar_count) || ohlcv.bar_count < 0) {
    throw new Error("OHLCV bar_count must be a non-negative integer.");
  }
  if (ohlcv.bar_count !== ohlcv.bars.length) {
    throw new Error("OHLCV bar_count must equal bars length.");
  }
  if (!Number.isInteger(ohlcv.total_available)) {
    throw new Error("OHLCV total_available must be an integer.");
  }
  if (ohlcv.total_available < ohlcv.bar_count) {
    throw new Error("OHLCV total_available must not be less than bar_count.");
  }
  if (ohlcv.total_available < 700) {
    throw new Error("OHLCV total_available must be at least 700.");
  }
  if (ohlcv.bars.length !== 500) {
    throw new Error("OHLCV response must contain exactly 500 returned bars.");
  }

  let previousTime = null;
  for (const [index, bar] of ohlcv.bars.entries()) {
    for (const field of ["time", "open", "high", "low", "close"]) {
      if (typeof bar?.[field] !== "number" || !Number.isFinite(bar[field])) {
        throw new Error(`OHLCV bar ${index} ${field} must be finite.`);
      }
    }
    if (
      [bar.open, bar.high, bar.low, bar.close].some((value) => value <= 0)
    ) {
      throw new Error(
        `OHLCV bar ${index} OHLC values must be strictly positive.`,
      );
    }
    if (
      bar.low > bar.open ||
      bar.low > bar.close ||
      bar.open > bar.high ||
      bar.close > bar.high
    ) {
      throw new Error(`OHLCV bar ${index} has an invalid OHLC relationship.`);
    }
    if (
      Object.hasOwn(bar, "volume") &&
      (typeof bar.volume !== "number" ||
        !Number.isFinite(bar.volume) ||
        bar.volume < 0)
    ) {
      throw new Error(
        `OHLCV bar ${index} volume must be finite and non-negative.`,
      );
    }
    if (previousTime !== null && bar.time <= previousTime) {
      throw new Error("OHLCV bar times must be strictly increasing.");
    }
    previousTime = bar.time;
  }

  const lastBar = ohlcv.bars.at(-1);
  const end = barDate(lastBar.time);
  if (end < "2022-01-01") {
    throw new Error("Last OHLCV bar must not precede 2022-01-01.");
  }
  return { last_bar: lastBar, end };
}

export function renderMarkdown(bundle) {
  const performance = bundle?.performance ?? {};
  const metrics =
    performance.metrics && typeof performance.metrics === "object"
      ? performance.metrics
      : {};
  const strategyReturn = benchmarkMetricFromTables(
    bundle?.tables,
    "Strategy equity return",
  );
  const tableBuyHold = benchmarkMetricFromTables(
    bundle?.tables,
    "Buy & hold return",
  );
  const buyHold = tableBuyHold ?? numberOrNull(metrics.buy_hold_return);
  const tableExcess = benchmarkMetricFromTables(
    bundle?.tables,
    "Excess return",
  );
  const excess =
    tableExcess ??
    (strategyReturn !== null && buyHold !== null
      ? strategyReturn - buyHold
      : null);
  const stopRegressions = benchmarkMetricFromTables(
    bundle?.tables,
    "Stop regressions",
  );
  const compileErrors = Array.isArray(bundle?.compile?.errors)
    ? bundle.compile.errors.length
    : numberOrNull(bundle?.compile?.error_count);
  const metricCount =
    numberOrNull(performance.metric_count) ?? Object.keys(metrics).length;
  const orderCount =
    numberOrNull(bundle?.trades?.total_orders) ??
    (Array.isArray(bundle?.trades?.orders)
      ? bundle.trades.orders.length
      : Array.isArray(bundle?.trades?.trades)
        ? bundle.trades.trades.length
        : null);
  const savedTradeCount = Array.isArray(bundle?.trades?.trades)
    ? bundle.trades.trades.length
    : null;
  const reportedTradeLimit = numberOrNull(bundle?.trade_limit) ?? tradeLimit;
  const tradesTruncated =
    bundle?.trades_truncated === true ||
    (orderCount !== null && orderCount > reportedTradeLimit);
  const chart = bundle?.chart ?? {};

  return `# SPY SMA 50/200 + ATR 趋势策略回测报告

策略：${performance.strategy_name ?? performance.strategy ?? "不可用"}
计价货币：${performance.currency ?? "不可用"}

## 结论数据

| 指标 | 结果 |
| --- | ---: |
| 回测期间 | ${bundle?.period?.start ?? "不可用"} 至 ${bundle?.period?.end ?? "不可用"} |
| 净利润（USD） | ${formatNumber(metrics.net_profit)} |
| 净收益率 | ${formatPercent(metrics.net_profit_percent)} |
| 策略权益收益率 | ${formatPercent(strategyReturn)} |
| 最大回撤率 | ${formatPercent(metrics.max_drawdown_percent)} |
| 总交易数 | ${formatNumber(metrics.total_trades)} |
| 胜率 | ${formatPercent(metrics.percent_profitable)} |
| 盈亏比 | ${formatNumber(metrics.profit_factor)} |
| 平均交易收益（USD） | ${formatNumber(metrics.avg_trade)} |
| 佣金（USD） | ${formatNumber(metrics.commission_paid)} |
| 买入持有 | ${formatPercent(buyHold)} |
| 超额 | ${formatPercent(excess)} |
| 止损下移 | ${formatNumber(stopRegressions)} |

## 验证证据

| 检查项 | 结果 |
| --- | --- |
| 图表 | ${chart.full_name ?? "不可用"} / ${chart.exchange ?? "不可用"} / ${chart.description ?? "不可用"} / ${chart.resolution ?? "不可用"} |
| 编译错误 | ${formatNumber(compileErrors)} |
| 编辑器源码匹配 | ${bundle?.source_matches_editor === true ? "是" : "否"} |
| 性能指标数量 | ${formatNumber(metricCount)} |
| 订单记录 | ${formatNumber(orderCount)} |
| 订单明细保存 | 最近 ${savedTradeCount ?? "不可用"} 条（上限 ${reportedTradeLimit}；总订单 ${orderCount ?? "不可用"}；${tradesTruncated ? "已截断" : "未截断"}） |

## 回测假设

- 初始资金为 100,000 USD，使用 95% 权益，仅做多，不允许 pyramiding。
- 佣金为 0.0011%，滑点为 1 tick。
- 信号在收盘时确认，市价单在下一根 K 线开盘时执行。
- ATR 止损只允许上移；证据表中的止损下移次数为 ${formatNumber(stopRegressions)}。
- 买入持有基准使用相同的仓位、佣金和滑点成本口径。
- 本流程没有连接券商或提交真实订单。

## 可审计来源

- Pine 源码：\`strategies/spy_sma_atr_trend_v1.pine\`
- JSON 证据：\`docs/backtests/${outputStem}.json\`
- 生成时间：${bundle?.generated_at ?? "不可用"}
`;
}

export function publishArtifacts(
  bundle,
  targetDirectory = outputDirectory,
  operations = {},
) {
  const rename = operations.rename ?? renameSync;
  const jsonContents = `${JSON.stringify(bundle, null, 2)}\n`;
  const markdownContents = renderMarkdown(bundle);
  const jsonPath = path.join(targetDirectory, `${outputStem}.json`);
  const markdownPath = path.join(targetDirectory, `${outputStem}.md`);
  const token = `${process.pid}-${randomUUID()}`;
  const jsonTemporaryPath = path.join(
    targetDirectory,
    `.${outputStem}.${token}.json.tmp`,
  );
  const markdownTemporaryPath = path.join(
    targetDirectory,
    `.${outputStem}.${token}.md.tmp`,
  );
  const jsonBackupPath = `${jsonPath}.backup-${token}`;
  const markdownBackupPath = `${markdownPath}.backup-${token}`;
  const lockPath = path.join(targetDirectory, `.${outputStem}.lock`);
  let jsonBackedUp = false;
  let markdownBackedUp = false;
  let jsonPublished = false;
  let markdownPublished = false;

  const removeIfPresent = (filePath) => {
    if (existsSync(filePath)) unlinkSync(filePath);
  };

  mkdirSync(targetDirectory, { recursive: true });
  try {
    writeFileSync(lockPath, token, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Artifact publish already in progress for ${outputStem}.`,
        { cause: error },
      );
    }
    throw error;
  }

  try {
    writeFileSync(jsonTemporaryPath, jsonContents, "utf8");
    writeFileSync(markdownTemporaryPath, markdownContents, "utf8");

    if (existsSync(jsonPath)) {
      rename(jsonPath, jsonBackupPath);
      jsonBackedUp = true;
    }
    if (existsSync(markdownPath)) {
      rename(markdownPath, markdownBackupPath);
      markdownBackedUp = true;
    }

    rename(jsonTemporaryPath, jsonPath);
    jsonPublished = true;
    rename(markdownTemporaryPath, markdownPath);
    markdownPublished = true;

    for (const backupPath of [jsonBackupPath, markdownBackupPath]) {
      try {
        removeIfPresent(backupPath);
      } catch {
        // A consistent final pair is already published; stale backups are safer.
      }
    }
    return { json: jsonPath, markdown: markdownPath };
  } catch (error) {
    const rollbackErrors = [];
    for (const [published, finalPath] of [
      [jsonPublished, jsonPath],
      [markdownPublished, markdownPath],
    ]) {
      if (!published) continue;
      try {
        removeIfPresent(finalPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const [backedUp, backupPath, finalPath] of [
      [jsonBackedUp, jsonBackupPath, jsonPath],
      [markdownBackedUp, markdownBackupPath, markdownPath],
    ]) {
      if (!backedUp || !existsSync(backupPath)) continue;
      try {
        rename(backupPath, finalPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const temporaryPath of [jsonTemporaryPath, markdownTemporaryPath]) {
      try {
        removeIfPresent(temporaryPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `Artifact publish failed and rollback was incomplete: ${rollbackErrors.map((item) => item.message).join("; ")}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    removeIfPresent(lockPath);
  }
}

export function runTv(args) {
  const stdout = execFileSync(process.execPath, [tvCli, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 30_000,
  });
  return JSON.parse(stdout);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function pollResponse(
  run,
  args,
  {
    label = "CLI response",
    attempts = 10,
    sleep = defaultSleep,
    predicate = (result) => result?.success === true,
  } = {},
) {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("Polling attempts must be a positive integer.");
  }
  const retryableError =
    /(?:not ready|unavailable|not computed|pending|no strategy data)/i;
  let lastError = "not ready";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await run(args);
    if (await predicate(result)) return result;
    if (result?.success !== false) {
      throw new Error(`${label} returned an invalid success response.`);
    }
    lastError =
      typeof result.error === "string" ? result.error : JSON.stringify(result);
    if (!retryableError.test(lastError)) {
      throw new Error(`${label} failed: ${lastError}`);
    }
    if (attempt < attempts) await sleep(1000);
  }

  throw new Error(
    `${label} unavailable after ${attempts} attempts: ${lastError}`,
  );
}

export async function executeBacktest(run = runTv, options = {}) {
  const {
    attempts = 10,
    sleep = defaultSleep,
    publish = publishArtifacts,
    now = () => new Date(),
  } = options;
  const localSource = readFileSync(sourcePath, "utf8");

  requireSuccess(await run(["symbol", "AMEX:SPY"]), "Set chart symbol");
  requireSuccess(await run(["timeframe", "1D"]), "Set chart timeframe");
  const chart = await run(["info"]);
  validateChart(chart);
  const strategyStateBefore = await run(["state"]);
  validateStateContext(strategyStateBefore, "Pre-compile strategy state");

  requireSuccess(
    await run(["pine", "set", "--file", sourcePath]),
    "Set Pine source",
  );
  const editorSource = requireSuccess(
    await run(["pine", "get"]),
    "Get Pine source",
  );
  if (editorSource.source?.trim() !== localSource.trim()) {
    throw new Error("Pine editor source does not match the local source file.");
  }

  const compile = await run(["pine", "compile"]);
  validateCompile(compile);

  const strategyStateAfter = await run(["state"]);
  const matchedStrategy = bindStrategyInstance(
    strategyStateBefore,
    strategyStateAfter,
    compile,
  );
  const strategyInput = await run([
    "data",
    "indicator",
    matchedStrategy.entity_id,
  ]);
  const validatedDefaults = validateStrategyInputs(
    strategyInput,
    matchedStrategy.entity_id,
  );

  const pollingOptions = { attempts, sleep };
  const performance = await pollResponse(run, ["data", "strategy"], {
    ...pollingOptions,
    label: "Strategy performance",
    predicate: (result) => result?.success === true,
  });
  validatePerformance(performance);
  const trades = await pollResponse(run, ["data", "trades", "--max", "20"], {
    ...pollingOptions,
    label: "Strategy trades",
    predicate: (result) => result?.success === true,
  });
  validateTrades(trades, performance.metrics.total_trades, tradeLimit);
  const runTables = async (args) => {
    const response = await run(args);
    if (
      response?.success === true &&
      response.study_count === 0 &&
      Array.isArray(response.studies) &&
      response.studies.length === 0
    ) {
      return {
        success: false,
        error: "Strategy tables not ready: no strategy data.",
      };
    }
    return response;
  };
  const tables = await pollResponse(
    runTables,
    ["data", "tables", "--filter", EXPECTED_STRATEGY_NAME],
    {
      ...pollingOptions,
      label: "Strategy tables",
      predicate: (result) => result?.success === true,
    },
  );
  const tableEvidence = validateTables(tables);
  const ohlcv = await run(["ohlcv", "--count", "500"]);
  const validatedOhlcv = validateOhlcv(ohlcv);
  const generatedAt = now();
  const generatedDate =
    generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) {
    throw new Error("Generated timestamp is invalid.");
  }

  const bundle = {
    generated_at: generatedDate.toISOString(),
    chart,
    period: {
      start: "2022-01-01",
      end: validatedOhlcv.end,
    },
    compile,
    source_matches_editor: true,
    compile_action: compile.button_clicked,
    strategy_state_before: strategyStateBefore,
    strategy_state_after: strategyStateAfter,
    strategy_binding: {
      name: EXPECTED_STRATEGY_NAME,
      entity_id: matchedStrategy.entity_id,
      compile_action: matchedStrategy.compile_action,
    },
    strategy_state: {
      ...strategyStateAfter,
      entity_id: matchedStrategy.entity_id,
    },
    strategy_input: { ...strategyInput, validated_defaults: validatedDefaults },
    performance,
    trades,
    trade_limit: tradeLimit,
    trades_truncated: trades.total_orders > tradeLimit,
    tables,
    table_evidence: tableEvidence,
    last_bar: validatedOhlcv.last_bar,
  };

  const paths = await publish(bundle, outputDirectory);

  return {
    paths,
    bundle,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  executeBacktest()
    .then(({ paths, bundle }) => {
      console.log(
        JSON.stringify(
          {
            success: true,
            paths,
            metrics: bundle.performance?.metrics ?? {},
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error(error?.stack ?? error?.message ?? String(error));
      process.exitCode = 1;
    });
}

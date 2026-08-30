import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const tvCli =
  process.env.TV_CLI ??
  "/home/jingtianyu/projects/tradingview-mcp/src/cli/index.js";
const numericTextPattern =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

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

export function benchmarkMetricFromTables(tables, expectedLabel) {
  const studies = Array.isArray(tables?.studies) ? tables.studies : [];
  for (const study of studies) {
    const studyTables = Array.isArray(study?.tables) ? study.tables : [];
    for (const table of studyTables) {
      const rows = Array.isArray(table?.rows) ? table.rows : [];
      for (const row of rows) {
        if (typeof row !== "string") continue;
        const cells = row.split("|").map((cell) => cell.trim());
        if (cells.length !== 2) continue;
        const [label, rawValue] = cells;
        if (label !== expectedLabel) continue;
        const numericText = rawValue.endsWith("%")
          ? rawValue.slice(0, -1).trim()
          : rawValue;
        if (!numericTextPattern.test(numericText)) return null;
        const parsed = Number.parseFloat(numericText);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
  }
  return null;
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
  const tableBuyHold =
    benchmarkMetricFromTables(bundle?.tables, "Buy & hold return") ??
    benchmarkMetricFromTables(bundle?.tables, "Buy & hold");
  const buyHold = tableBuyHold ?? numberOrNull(metrics.buy_hold_return);
  const tableExcess =
    benchmarkMetricFromTables(bundle?.tables, "Excess return") ??
    benchmarkMetricFromTables(bundle?.tables, "Excess");
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

export function runTv(args) {
  const stdout = execFileSync(process.execPath, [tvCli, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(stdout);
}

async function waitForStrategy(run, attempts = 10) {
  let lastError = "strategy data was not ready";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await run(["data", "strategy"]);
      if (result?.success) return result;
      lastError = result?.error ?? JSON.stringify(result);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(
    `Strategy results unavailable after ${attempts} attempts: ${lastError}`,
  );
}

export async function executeBacktest(run = runTv) {
  const localSource = readFileSync(sourcePath, "utf8");

  requireSuccess(await run(["symbol", "SPY"]), "Set chart symbol");
  requireSuccess(await run(["timeframe", "1D"]), "Set chart timeframe");
  const chart = await run(["info"]);
  validateChart(chart);

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
  const compileErrors = Array.isArray(compile?.errors) ? compile.errors : [];
  if (
    !compile?.success ||
    compile?.has_errors === true ||
    numberOrNull(compile?.error_count) > 0 ||
    compileErrors.length > 0
  ) {
    throw new Error(`Pine compile failed: ${JSON.stringify(compile)}`);
  }

  const performance = await waitForStrategy(run);
  const trades = requireSuccess(
    await run(["data", "trades", "--max", "100"]),
    "Get strategy trades",
  );
  const tables = requireSuccess(
    await run(["data", "tables", "--filter", "SPY SMA"]),
    "Get evidence tables",
  );
  const ohlcv = requireSuccess(
    await run(["ohlcv", "--count", "500"]),
    "Get OHLCV data",
  );
  const bars = Array.isArray(ohlcv?.bars) ? ohlcv.bars : [];
  const lastBar = bars.at(-1);
  if (!lastBar) throw new Error("OHLCV response did not contain any bars.");

  const bundle = {
    generated_at: new Date().toISOString(),
    chart,
    period: {
      start: "2022-01-01",
      end: barDate(lastBar.time),
    },
    compile,
    source_matches_editor: true,
    performance,
    trades,
    tables,
    last_bar: lastBar,
  };

  const stopRegressions = benchmarkMetricFromTables(tables, "Stop regressions");
  if (stopRegressions !== 0) {
    throw new Error(
      `Expected Stop regressions to equal 0, received ${stopRegressions ?? "missing"}.`,
    );
  }

  const jsonPath = path.join(outputDirectory, `${outputStem}.json`);
  const markdownPath = path.join(outputDirectory, `${outputStem}.md`);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(bundle), "utf8");

  return {
    paths: {
      json: jsonPath,
      markdown: markdownPath,
    },
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

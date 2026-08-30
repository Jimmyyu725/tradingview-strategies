import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  EXPECTED_STRATEGY_NAME,
  benchmarkMetricFromTables,
  executeBacktest,
  pollResponse,
  publishArtifacts,
  renderMarkdown,
  validateChart,
  validateCompile,
  validateOhlcv,
  validatePerformance,
  validateStrategyInputs,
  validateStrategyState,
  validateTables,
  validateTrades,
} from "../scripts/run_tradingview_backtest.mjs";

const validChart = {
  success: true,
  symbol: "SPY",
  full_name: "AMEX:SPY",
  exchange: "NYSE Arca",
  description: "SPDR S&P 500 ETF TRUST",
  resolution: "D",
};

const evidenceTables = {
  success: true,
  study_count: 1,
  studies: [
    {
      name: EXPECTED_STRATEGY_NAME,
      tables: [
        {
          rows: [
            "Metric | Value",
            "Strategy equity return | 8.25%",
            "Buy & hold return | 12.50%",
            "Excess return | -4.25%",
            "Stop regressions | 0",
          ],
        },
      ],
    },
  ],
};

const validMetrics = {
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
};

const validPerformance = {
  success: true,
  metric_count: Object.keys(validMetrics).length,
  strategy: EXPECTED_STRATEGY_NAME,
  currency: "USD",
  source: "internal_api",
  metrics: validMetrics,
};

const validTrades = {
  success: true,
  trade_count: 4,
  total_orders: 4,
  source: "internal_api",
  trades: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }],
};

const lastBarSeconds = Date.parse("2026-08-28T00:00:00Z") / 1000;
const validBars = Array.from({ length: 500 }, (_, index) => ({
  time: lastBarSeconds - (499 - index) * 86_400,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 1000,
}));

const validOhlcv = {
  success: true,
  bar_count: validBars.length,
  total_available: 900,
  source: "direct_bars",
  bars: validBars,
};

const validCompile = {
  success: true,
  has_errors: false,
  error_count: 0,
  errors: [],
};

const validStrategyState = {
  success: true,
  symbol: "AMEX:SPY",
  resolution: "D",
  studies: [{ id: "strategy-1", name: EXPECTED_STRATEGY_NAME }],
};

const validStrategyInput = {
  success: true,
  entity_id: "strategy-1",
  visible: true,
  inputs: [
    { id: "in_0", value: 50 },
    { id: "in_1", value: 200 },
    { id: "in_2", value: 14 },
    { id: "in_3", value: 2 },
    { id: "in_4", value: Date.parse("2022-01-01T00:00:00Z") },
  ],
};

function completeBundle() {
  return {
    generated_at: "2026-08-30T12:00:00.000Z",
    chart: validChart,
    period: { start: "2022-01-01", end: "2026-08-28" },
    compile: validCompile,
    source_matches_editor: true,
    strategy_state: { ...validStrategyState, entity_id: "strategy-1" },
    strategy_input: {
      ...validStrategyInput,
      validated_defaults: {
        fast_sma_length: 50,
        slow_sma_length: 200,
        atr_length: 14,
        atr_multiplier: 2,
        backtest_start: "2022-01-01T00:00:00.000Z",
      },
    },
    performance: validPerformance,
    trades: validTrades,
    tables: evidenceTables,
    table_evidence: {
      strategy_equity_return: 8.25,
      buy_hold_return: 12.5,
      excess_return: -4.25,
      stop_regressions: 0,
    },
    last_bar: validOhlcv.bars.at(-1),
  };
}

test("validateChart accepts only the fixed SPY daily chart", () => {
  assert.doesNotThrow(() => validateChart(validChart));
  assert.throws(
    () => validateChart({ ...validChart, symbol: "AAPL" }),
    /Expected SPY/,
  );
  assert.throws(
    () => validateChart({ ...validChart, resolution: "60" }),
    /Expected daily timeframe/,
  );
  assert.throws(
    () => validateChart({ ...validChart, full_name: "NYSE:SPY" }),
    /Expected AMEX:SPY/,
  );
  assert.throws(
    () => validateChart({ ...validChart, exchange: "NYSE" }),
    /Expected NYSE Arca/,
  );
  assert.throws(
    () => validateChart({ ...validChart, description: "SPY" }),
    /Expected SPDR S&P 500 ETF TRUST/,
  );
});

test("validateCompile requires an explicit error-free compile response", () => {
  assert.doesNotThrow(() =>
    validateCompile({
      success: true,
      has_errors: false,
      error_count: 0,
      errors: [],
    }),
  );
  assert.throws(
    () => validateCompile({ success: true, errors: [] }),
    /has_errors must be false/,
  );
  assert.throws(
    () =>
      validateCompile({
        success: true,
        has_errors: false,
        errors: [{ message: "compile error" }],
      }),
    /errors must be an empty array/,
  );
});

test("validateStrategyState requires exactly one exact strategy instance", () => {
  const matched = validateStrategyState({
    success: true,
    studies: [
      { id: "other-1", name: "Volume" },
      { id: "strategy-1", name: EXPECTED_STRATEGY_NAME },
    ],
  });

  assert.equal(matched.entity_id, "strategy-1");
  assert.throws(
    () =>
      validateStrategyState({
        success: true,
        studies: [{ id: "wrong", name: `${EXPECTED_STRATEGY_NAME} copy` }],
      }),
    /exactly one strategy instance/,
  );
  assert.throws(
    () =>
      validateStrategyState({
        success: true,
        studies: [
          { id: "strategy-1", name: EXPECTED_STRATEGY_NAME },
          { id: "strategy-2", name: EXPECTED_STRATEGY_NAME },
        ],
      }),
    /exactly one strategy instance/,
  );
});

test("validateStrategyInputs proves named and id-only Pine defaults", () => {
  const startSeconds = Date.parse("2022-01-01T00:00:00Z") / 1000;
  const startMilliseconds = startSeconds * 1000;
  const namedInput = {
    success: true,
    entity_id: "strategy-1",
    inputs: [
      { name: "fastLength", value: 50 },
      { title: "Slow SMA length", value: 200 },
      { name: "atrLength", value: 14 },
      { title: "ATR multiplier", value: 2 },
      { name: "startDate", value: startSeconds },
    ],
  };
  const named = validateStrategyInputs(namedInput, "strategy-1");
  const idOnly = validateStrategyInputs(
    {
      success: true,
      entity_id: "strategy-1",
      inputs: [
        { id: "in_0", value: 50 },
        { id: "in_1", value: 200 },
        { id: "in_2", value: 14 },
        { id: "in_3", value: 2 },
        { id: "in_4", value: startMilliseconds },
      ],
    },
    "strategy-1",
  );

  assert.equal(named.backtest_start, "2022-01-01T00:00:00.000Z");
  assert.deepEqual(idOnly, named);
  assert.throws(
    () =>
      validateStrategyInputs(
        { ...namedInput, entity_id: "strategy-2" },
        "strategy-1",
      ),
    /entity_id must match strategy-1/,
  );
  assert.throws(
    () =>
      validateStrategyInputs({
        success: true,
        inputs: [{ id: "length", value: 50 }],
      }),
    /Cannot prove Pine input defaults/,
  );
  assert.throws(
    () =>
      validateStrategyInputs({
        success: true,
        inputs: [
          { id: "in_0", value: 51 },
          { id: "in_1", value: 200 },
          { id: "in_2", value: 14 },
          { id: "in_3", value: 2 },
          { id: "in_4", value: startMilliseconds },
        ],
      }),
    /Fast SMA length must equal 50/,
  );
});

test("benchmarkMetricFromTables enforces exact labels, units, and uniqueness", () => {
  assert.equal(
    benchmarkMetricFromTables(evidenceTables, "Buy & hold return"),
    12.5,
  );
  assert.equal(
    benchmarkMetricFromTables(evidenceTables, "Stop regressions"),
    0,
  );
  assert.equal(benchmarkMetricFromTables(evidenceTables, "Missing"), null);
  assert.equal(benchmarkMetricFromTables(null, "Buy & hold return"), null);
  assert.equal(
    benchmarkMetricFromTables(
      {
        studies: [
          {
            tables: [{ rows: [null, "Buy & hold return | not-a-number%"] }],
          },
        ],
      },
      "Buy & hold return",
    ),
    null,
  );
  assert.equal(
    benchmarkMetricFromTables(
      { studies: [{ tables: [{ rows: ["Stop regressions | 0oops"] }] }] },
      "Stop regressions",
    ),
    null,
  );
  assert.throws(
    () =>
      benchmarkMetricFromTables(
        {
          studies: [
            { tables: [{ rows: ["Buy & hold return | 12.50"] }] },
          ],
        },
        "Buy & hold return",
      ),
    /must end with %/,
  );
  assert.throws(
    () =>
      benchmarkMetricFromTables(
        { studies: [{ tables: [{ rows: ["Stop regressions | 0%"] }] }] },
        "Stop regressions",
      ),
    /must not include %/,
  );
  assert.throws(
    () =>
      benchmarkMetricFromTables(
        {
          studies: [
            {
              tables: [
                {
                  rows: [
                    "Excess return | -4.25%",
                    "Excess return | -4.25%",
                  ],
                },
              ],
            },
          ],
        },
        "Excess return",
      ),
    /Duplicate table metric: Excess return/,
  );
});

test("validatePerformance requires complete finite USD strategy metrics", () => {
  assert.doesNotThrow(() => validatePerformance(validPerformance));
  const missingOpenPl = {
    ...validPerformance,
    metric_count: validPerformance.metric_count - 1,
    metrics: { ...validMetrics },
  };
  delete missingOpenPl.metrics.open_pl;

  assert.throws(
    () => validatePerformance(missingOpenPl),
    /Missing required performance metric: open_pl/,
  );
  assert.throws(
    () =>
      validatePerformance({ ...validPerformance, strategy: "Wrong strategy" }),
    /Unexpected performance strategy/,
  );
  assert.throws(
    () => validatePerformance({ ...validPerformance, currency: "EUR" }),
    /currency must be USD/,
  );
  assert.throws(
    () =>
      validatePerformance({
        ...validPerformance,
        metrics: { ...validMetrics, net_profit: Number.NaN },
      }),
    /net_profit must be finite/,
  );
});

test("validateTrades rejects contradictory or missing order evidence", () => {
  assert.doesNotThrow(() => validateTrades(validTrades, validMetrics.total_trades));
  assert.throws(
    () =>
      validateTrades(
        { ...validTrades, trade_count: 3 },
        validMetrics.total_trades,
      ),
    /trade_count must equal trades length/,
  );
  assert.throws(
    () =>
      validateTrades(
        { ...validTrades, trade_count: 0, total_orders: 0, trades: [] },
        validMetrics.total_trades,
      ),
    /zero orders contradicts total_trades/,
  );
  assert.throws(
    () =>
      validateTrades(
        { ...validTrades, trade_count: 0, total_orders: 10, trades: [] },
        validMetrics.total_trades,
      ),
    /trade_count must equal the expected returned order count/,
  );
});

test("validateTables requires one exact study and all unit-safe evidence", () => {
  assert.deepEqual(validateTables(evidenceTables), {
    strategy_equity_return: 8.25,
    buy_hold_return: 12.5,
    excess_return: -4.25,
    stop_regressions: 0,
  });
  assert.throws(
    () =>
      validateTables({
        ...evidenceTables,
        studies: [
          { ...evidenceTables.studies[0], name: `${EXPECTED_STRATEGY_NAME} copy` },
        ],
      }),
    /exact strategy study/,
  );
  assert.throws(
    () =>
      validateTables({
        ...evidenceTables,
        studies: [
          {
            ...evidenceTables.studies[0],
            tables: [{ rows: ["Strategy equity return | 8.25%"] }],
          },
        ],
      }),
    /Missing required table metric: Buy & hold return/,
  );
});

test("validateOhlcv requires sufficient sane daily history", () => {
  const validated = validateOhlcv(validOhlcv);
  assert.equal(validated.end, "2026-08-28");
  assert.equal(validated.last_bar.close, 105);
  assert.throws(
    () => validateOhlcv({ ...validOhlcv, bar_count: 499 }),
    /bar_count must equal bars length/,
  );
  assert.throws(
    () =>
      validateOhlcv({
        ...validOhlcv,
        bar_count: 1,
        bars: [validOhlcv.bars.at(-1)],
      }),
    /exactly 500 returned bars/,
  );
  assert.throws(
    () => validateOhlcv({ ...validOhlcv, total_available: 499 }),
    /must not be less than bar_count/,
  );
  assert.throws(
    () => validateOhlcv({ ...validOhlcv, total_available: 699 }),
    /at least 700/,
  );
  assert.throws(
    () =>
      validateOhlcv({
        ...validOhlcv,
        bars: [
          ...validOhlcv.bars.slice(0, -1),
          { ...validOhlcv.bars.at(-1), low: 106 },
        ],
      }),
    /OHLC relationship/,
  );
  assert.throws(
    () =>
      validateOhlcv({
        ...validOhlcv,
        bars: [
          ...validOhlcv.bars.slice(0, -1),
          { ...validOhlcv.bars.at(-1), open: 0 },
        ],
      }),
    /OHLC values must be strictly positive/,
  );
  assert.throws(
    () =>
      validateOhlcv({
        ...validOhlcv,
        bars: [
          ...validOhlcv.bars.slice(0, -1),
          {
            ...validOhlcv.bars.at(-1),
            time: Date.parse("2021-12-31T00:00:00Z"),
          },
        ],
      }),
    /must not precede 2022-01-01/,
  );
});

test("pollResponse supports synchronous success and retryable readiness", async () => {
  const immediate = await pollResponse(
    () => ({ success: true, value: "ready" }),
    ["data", "strategy"],
    { label: "performance", attempts: 3, sleep: async () => {} },
  );
  const responses = [
    { success: false, error: "Strategy report not computed yet" },
    { success: true, value: "ready after retry" },
  ];
  const sleeps = [];
  const retried = await pollResponse(
    () => responses.shift(),
    ["data", "strategy"],
    {
      label: "performance",
      attempts: 3,
      sleep: async (milliseconds) => sleeps.push(milliseconds),
    },
  );

  assert.equal(immediate.value, "ready");
  assert.equal(retried.value, "ready after retry");
  assert.deepEqual(sleeps, [1000]);
});

test("pollResponse propagates permanent exceptions without retrying", async () => {
  const permanentError = new SyntaxError("invalid CLI JSON");
  let calls = 0;
  let sleeps = 0;

  await assert.rejects(
    () =>
      pollResponse(
        () => {
          calls += 1;
          throw permanentError;
        },
        ["data", "strategy"],
        {
          label: "performance",
          attempts: 10,
          sleep: async () => {
            sleeps += 1;
          },
        },
      ),
    (error) => error === permanentError,
  );
  assert.equal(calls, 1);
  assert.equal(sleeps, 0);

  await assert.rejects(
    () =>
      pollResponse(
        () => ({ success: false, error: "permission denied" }),
        ["data", "strategy"],
        { label: "performance", attempts: 10, sleep: async () => {} },
      ),
    /permission denied/,
  );
});

test("renderMarkdown reports results, evidence, assumptions, and safety scope", () => {
  const bundle = {
    generated_at: "2026-08-30T12:00:00Z",
    chart: validChart,
    period: {
      start: "2022-01-01",
      end: "2026-08-28",
    },
    compile: validCompile,
    source_matches_editor: true,
    performance: validPerformance,
    trades: validTrades,
    tables: evidenceTables,
  };

  const markdown = renderMarkdown(bundle);

  assert.match(markdown, /净收益率\s*\|\s*8\.25%/);
  assert.match(markdown, /买入持有\s*\|\s*12\.50%/);
  assert.match(markdown, /超额\s*\|\s*-4\.25%/);
  assert.match(markdown, /止损下移\s*\|\s*0(?:\.00)?/);
  assert.match(markdown, /订单记录\s*\|\s*4/);
  assert.match(markdown, /没有连接券商或提交真实订单/);
});

test("renderMarkdown marks non-numeric metric values unavailable", () => {
  const markdown = renderMarkdown({
    performance: {
      metrics: {
        net_profit: "   ",
        total_trades: false,
      },
    },
  });

  assert.match(markdown, /净利润（USD）\s*\|\s*不可用/);
  assert.match(markdown, /总交易数\s*\|\s*不可用/);
});

test("renderMarkdown prefers the Pine evidence labels over metric fallbacks", () => {
  const markdown = renderMarkdown({
    performance: {
      ...validPerformance,
      metric_count: validPerformance.metric_count + 1,
      metrics: { ...validMetrics, buy_hold_return: 99 },
    },
    tables: evidenceTables,
  });

  assert.match(markdown, /买入持有\s*\|\s*12\.50%/);
  assert.match(markdown, /超额\s*\|\s*-4\.25%/);
});

test("executeBacktest validates complete synchronous evidence before publishing", async () => {
  const localSource = readFileSync(
    new URL("../strategies/spy_sma_atr_trend_v1.pine", import.meta.url),
    "utf8",
  );
  const calls = [];
  let stateSeen = false;
  let tableCalls = 0;
  let publishedBundle;
  const sleeps = [];
  const run = (args) => {
    calls.push(args);
    const command = args.join(" ");
    if (command === "symbol SPY" || command === "timeframe 1D") {
      return { success: true };
    }
    if (command === "info") return validChart;
    if (args[0] === "pine" && args[1] === "set") return { success: true };
    if (command === "pine get") return { success: true, source: localSource };
    if (command === "pine compile") return validCompile;
    if (command === "state") {
      stateSeen = true;
      return validStrategyState;
    }
    if (command === "data indicator strategy-1") return validStrategyInput;
    if (command === "data strategy") return validPerformance;
    if (command === "data trades --max 100") {
      if (!stateSeen) throw new Error("Strategy state was not validated.");
      return validTrades;
    }
    if (command === `data tables --filter ${EXPECTED_STRATEGY_NAME}`) {
      tableCalls += 1;
      return tableCalls === 1
        ? { success: true, study_count: 0, studies: [] }
        : evidenceTables;
    }
    if (command === "ohlcv --count 500") return validOhlcv;
    throw new Error(`Unexpected command: ${command}`);
  };

  const result = await executeBacktest(run, {
    attempts: 2,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    now: () => new Date("2026-08-30T12:00:00Z"),
    publish: (bundle) => {
      publishedBundle = bundle;
      return { json: "/tmp/report.json", markdown: "/tmp/report.md" };
    },
  });

  assert.deepEqual(result.paths, {
    json: "/tmp/report.json",
    markdown: "/tmp/report.md",
  });
  assert.equal(result.bundle, publishedBundle);
  assert.equal(result.bundle.strategy_state.entity_id, "strategy-1");
  assert.equal(
    result.bundle.strategy_input.validated_defaults.backtest_start,
    "2022-01-01T00:00:00.000Z",
  );
  assert.equal(result.bundle.period.end, "2026-08-28");
  assert.equal(tableCalls, 2);
  assert.deepEqual(sleeps, [1000]);
  assert.doesNotMatch(renderMarkdown(result.bundle), /不可用/);
  assert.ok(
    calls.some(
      (args) =>
        args.join(" ") ===
        `data tables --filter ${EXPECTED_STRATEGY_NAME}`,
    ),
  );
});

test("executeBacktest stops on failed trade evidence", async () => {
  const localSource = readFileSync(
    new URL("../strategies/spy_sma_atr_trend_v1.pine", import.meta.url),
    "utf8",
  );
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    const command = args.join(" ");
    if (command === "symbol SPY" || command === "timeframe 1D") {
      return { success: true };
    }
    if (command === "info") return validChart;
    if (args[0] === "pine" && args[1] === "set") return { success: true };
    if (command === "pine get") {
      return { success: true, source: localSource };
    }
    if (command === "pine compile") {
      return validCompile;
    }
    if (command === "state") return validStrategyState;
    if (command === "data indicator strategy-1") return validStrategyInput;
    if (command === "data strategy") return validPerformance;
    if (command === "data trades --max 100") {
      return { success: false, error: "orders unavailable" };
    }
    throw new Error(`Unexpected command after failed trades: ${command}`);
  };

  await assert.rejects(
    () =>
      executeBacktest(run, {
        attempts: 1,
        sleep: async () => {},
      }),
    /Strategy trades unavailable after 1 attempts: orders unavailable/,
  );
  assert.deepEqual(calls.at(-1), ["data", "trades", "--max", "100"]);
});

test("publishArtifacts writes a complete JSON and Markdown pair", () => {
  const targetDirectory = mkdtempSync(path.join(tmpdir(), "tv-publish-"));
  try {
    const paths = publishArtifacts(completeBundle(), targetDirectory);

    assert.equal(
      JSON.parse(readFileSync(paths.json, "utf8")).performance.strategy,
      EXPECTED_STRATEGY_NAME,
    );
    assert.match(readFileSync(paths.markdown, "utf8"), /净收益率/);
    assert.deepEqual(readdirSync(targetDirectory).sort(), [
      "2026-08-30-spy-sma-atr-trend-v1.json",
      "2026-08-30-spy-sma-atr-trend-v1.md",
    ]);
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});

test("publishArtifacts restores the prior pair when Markdown publish fails", () => {
  const targetDirectory = mkdtempSync(path.join(tmpdir(), "tv-rollback-"));
  const jsonPath = path.join(
    targetDirectory,
    "2026-08-30-spy-sma-atr-trend-v1.json",
  );
  const markdownPath = path.join(
    targetDirectory,
    "2026-08-30-spy-sma-atr-trend-v1.md",
  );
  writeFileSync(jsonPath, "old json\n", "utf8");
  writeFileSync(markdownPath, "old markdown\n", "utf8");
  let failureInjected = false;
  const rename = (source, target) => {
    if (!failureInjected && target === markdownPath) {
      failureInjected = true;
      throw new Error("forced Markdown publish failure");
    }
    renameSync(source, target);
  };

  try {
    assert.throws(
      () =>
        publishArtifacts(completeBundle(), targetDirectory, {
          rename,
        }),
      /forced Markdown publish failure/,
    );
    assert.equal(readFileSync(jsonPath, "utf8"), "old json\n");
    assert.equal(readFileSync(markdownPath, "utf8"), "old markdown\n");
    assert.deepEqual(readdirSync(targetDirectory).sort(), [
      "2026-08-30-spy-sma-atr-trend-v1.json",
      "2026-08-30-spy-sma-atr-trend-v1.md",
    ]);
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});

test("publishArtifacts rejects overlapping publishers for the same output pair", () => {
  const targetDirectory = mkdtempSync(path.join(tmpdir(), "tv-publish-lock-"));
  const outerBundle = completeBundle();
  const innerBundle = {
    ...completeBundle(),
    generated_at: "2026-08-30T13:00:00.000Z",
  };
  const jsonPath = path.join(
    targetDirectory,
    "2026-08-30-spy-sma-atr-trend-v1.json",
  );
  let overlapAttempted = false;
  const rename = (source, target) => {
    if (!overlapAttempted && target === jsonPath) {
      overlapAttempted = true;
      assert.throws(
        () => publishArtifacts(innerBundle, targetDirectory),
        /publish already in progress/,
      );
    }
    renameSync(source, target);
  };

  try {
    const paths = publishArtifacts(outerBundle, targetDirectory, { rename });
    const publishedJson = JSON.parse(readFileSync(paths.json, "utf8"));
    const publishedMarkdown = readFileSync(paths.markdown, "utf8");

    assert.equal(publishedJson.generated_at, outerBundle.generated_at);
    assert.match(publishedMarkdown, /2026-08-30T12:00:00\.000Z/);
    assert.doesNotMatch(publishedMarkdown, /2026-08-30T13:00:00\.000Z/);
    assert.deepEqual(readdirSync(targetDirectory).sort(), [
      "2026-08-30-spy-sma-atr-trend-v1.json",
      "2026-08-30-spy-sma-atr-trend-v1.md",
    ]);
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});

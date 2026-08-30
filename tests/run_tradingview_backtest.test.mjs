import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  benchmarkMetricFromTables,
  executeBacktest,
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

const evidenceTables = {
  studies: [
    {
      tables: [
        {
          rows: [
            "Metric | Value",
            "Strategy equity return | 8.25%",
            "Buy & hold | 12.50%",
            "Excess | -4.25%",
            "Stop regressions | 0",
          ],
        },
      ],
    },
  ],
};

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

test("benchmarkMetricFromTables extracts named percentages safely", () => {
  assert.equal(
    benchmarkMetricFromTables(evidenceTables, "Buy & hold"),
    12.5,
  );
  assert.equal(
    benchmarkMetricFromTables(evidenceTables, "Stop regressions"),
    0,
  );
  assert.equal(benchmarkMetricFromTables(evidenceTables, "Missing"), null);
  assert.equal(benchmarkMetricFromTables(null, "Buy & hold"), null);
  assert.equal(
    benchmarkMetricFromTables(
      { studies: [{ tables: [{ rows: [null, "Buy & hold | not-a-number"] }] }] },
      "Buy & hold",
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
});

test("renderMarkdown reports results, evidence, assumptions, and safety scope", () => {
  const bundle = {
    generated_at: "2026-08-30T12:00:00Z",
    chart: validChart,
    period: {
      start: "2022-01-01",
      end: "2026-08-28",
    },
    compile: {
      success: true,
      errors: [],
    },
    source_matches_editor: true,
    performance: {
      success: true,
      strategy_name: "SPY SMA 50/200 + ATR Trend v1",
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
    trades: {
      success: true,
      orders: [{}, {}, {}, {}],
    },
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
      metrics: {
        buy_hold_return: 99,
      },
    },
    tables: {
      studies: [
        {
          tables: [
            {
              rows: [
                "Strategy equity return | 8.25%",
                "Buy & hold return | 12.50%",
                "Excess return | -4.25%",
                "Stop regressions | 0",
              ],
            },
          ],
        },
      ],
    },
  });

  assert.match(markdown, /买入持有\s*\|\s*12\.50%/);
  assert.match(markdown, /超额\s*\|\s*-4\.25%/);
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
      return { success: true, errors: [] };
    }
    if (command === "data strategy") {
      return { success: true, metrics: {} };
    }
    if (command === "data trades --max 100") {
      return { success: false, error: "orders unavailable" };
    }
    throw new Error(`Unexpected command after failed trades: ${command}`);
  };

  await assert.rejects(
    () => executeBacktest(run),
    /Get strategy trades failed: orders unavailable/,
  );
  assert.deepEqual(calls.at(-1), ["data", "trades", "--max", "100"]);
});

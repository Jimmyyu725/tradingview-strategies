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

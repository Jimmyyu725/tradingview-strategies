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

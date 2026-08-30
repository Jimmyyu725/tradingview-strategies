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

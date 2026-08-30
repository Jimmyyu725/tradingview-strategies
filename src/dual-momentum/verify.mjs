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

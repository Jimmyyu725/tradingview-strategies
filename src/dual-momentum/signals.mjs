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

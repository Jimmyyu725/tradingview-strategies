import {
  EVALUATION_START,
  INITIAL_CAPITAL,
  POSITION_FRACTION,
} from "./config.mjs";
import { calculateOrderCosts } from "./costs.mjs";

function mapBars(seriesBySymbol) {
  return Object.fromEntries(
    Object.entries(seriesBySymbol).map(([symbol, series]) => [
      symbol,
      new Map(series.bars.map((bar) => [bar.date, bar])),
    ]),
  );
}

function executionSchedule(signals, dates) {
  const schedule = new Map();
  for (const signal of signals) {
    const executionDate = dates.find((date) => date > signal.signalDate);
    if (!executionDate) continue;
    schedule.set(executionDate, signal);
  }
  return schedule;
}

function tradeRecord({ date, symbol, side, costs, shares, signalDate, equity }) {
  return {
    date,
    signalDate,
    symbol,
    side,
    shares,
    executionPrice: costs.executionPrice,
    notional: costs.notional,
    fees: costs.totalFees,
    slippage: costs.slippage,
    equityBeforeTrade: equity,
    targetFraction: costs.notional / equity,
  };
}

export function backtestPortfolio({
  seriesBySymbol,
  signals,
  costProfile,
  startDate = EVALUATION_START,
  endDate = null,
  initialCapital = INITIAL_CAPITAL,
  positionFraction = POSITION_FRACTION,
}) {
  const symbols = Object.keys(seriesBySymbol);
  const dates = seriesBySymbol[symbols[0]].bars.map((bar) => bar.date);
  const bars = mapBars(seriesBySymbol);
  const schedule = executionSchedule(signals, dates);
  let cash = initialCapital;
  let holding = null;
  let shares = 0;
  const trades = [];
  const daily = [];

  for (const date of dates.filter((value) =>
    value >= startDate && (endDate === null || value <= endDate))) {
    const signal = schedule.get(date);
    if (signal && !symbols.includes(signal.target)) {
      throw new Error("Unknown target " + signal.target + ".");
    }
    if (signal && signal.target !== holding) {
      if (holding !== null) {
        const rawPrice = bars[holding].get(date)?.adjustedOpen;
        const equityBefore = cash + shares * rawPrice;
        const costs = calculateOrderCosts(costProfile, {
          side: "sell", shares, rawPrice,
        });
        cash += costs.notional - costs.totalFees;
        trades.push(tradeRecord({
          date,
          signalDate: signal.signalDate,
          symbol: holding,
          side: "sell",
          shares,
          costs,
          equity: equityBefore,
        }));
        holding = null;
        shares = 0;
      }
      const rawPrice = bars[signal.target].get(date)?.adjustedOpen;
      if (!Number.isFinite(rawPrice)) {
        throw new Error("Signal execution date is not on the common calendar.");
      }
      const equityBefore = cash;
      const executionPrice = rawPrice + costProfile.tick;
      const targetNotional = equityBefore * positionFraction;
      shares = targetNotional / executionPrice;
      const costs = calculateOrderCosts(costProfile, {
        side: "buy", shares, rawPrice,
      });
      cash -= costs.notional + costs.totalFees;
      if (cash < -1e-8 || costs.notional > equityBefore * positionFraction + 1e-8) {
        throw new Error("Portfolio funding or 95% target invariant failed.");
      }
      holding = signal.target;
      trades.push(tradeRecord({
        date,
        signalDate: signal.signalDate,
        symbol: holding,
        side: "buy",
        shares,
        costs,
        equity: equityBefore,
      }));
    }
    const close = holding === null ? 0 : bars[holding].get(date).adjustedClose;
    const marketValue = shares * close;
    const equity = cash + marketValue;
    if (!Number.isFinite(equity) || equity <= 0 || cash < -1e-8 || shares < 0) {
      throw new Error("Portfolio state invariant failed on " + date + ".");
    }
    daily.push({
      date,
      equity,
      cash,
      holding,
      shares,
      marketValue,
      exposure: marketValue / equity,
    });
  }
  return {
    initialCapital,
    costProfile: costProfile.name,
    daily,
    trades,
  };
}

export function hypotheticalLiquidation(result, seriesBySymbol, costProfile) {
  const last = result.daily.at(-1);
  if (!last || last.holding === null) {
    return { equity: last?.equity ?? result.initialCapital, fees: 0, slippage: 0 };
  }
  const bar = seriesBySymbol[last.holding].bars.find(
    (candidate) => candidate.date === last.date,
  );
  const costs = calculateOrderCosts(costProfile, {
    side: "sell",
    shares: last.shares,
    rawPrice: bar.adjustedClose,
  });
  return {
    equity: last.cash + costs.notional - costs.totalFees,
    fees: costs.totalFees,
    slippage: costs.slippage,
  };
}

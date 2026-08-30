function annualizedYears(start, end) {
  return (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
    (365.2425 * 86_400_000);
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / (values.length - 1);
  return Math.sqrt(variance);
}

export function independentReturnAndDrawdown(initialCapital, daily) {
  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const row of daily) {
    peak = Math.max(peak, row.equity);
    maxDrawdown = Math.min(maxDrawdown, row.equity / peak - 1);
  }
  return {
    totalReturn: daily.at(-1).equity / initialCapital - 1,
    maxDrawdown,
  };
}

export function computeMetrics(result) {
  if (!result.daily.length) throw new Error("Metrics require daily equity.");
  const returns = [];
  let prior = result.initialCapital;
  let peak = result.initialCapital;
  let peakDate = result.daily[0].date;
  let maxDrawdown = 0;
  let drawdownPeakDate = peakDate;
  let drawdownTroughDate = peakDate;
  let drawdownPeakEquity = peak;
  const equity = result.daily.map((row) => {
    const dailyReturn = row.equity / prior - 1;
    returns.push(dailyReturn);
    prior = row.equity;
    if (row.equity > peak) {
      peak = row.equity;
      peakDate = row.date;
    }
    const drawdown = row.equity / peak - 1;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      drawdownPeakDate = peakDate;
      drawdownTroughDate = row.date;
      drawdownPeakEquity = peak;
    }
    return { ...row, dailyReturn, drawdown };
  });
  const totalReturn = equity.at(-1).equity / result.initialCapital - 1;
  const years = annualizedYears(equity[0].date, equity.at(-1).date);
  const cagr = years > 0 ? (1 + totalReturn) ** (1 / years) - 1 : totalReturn;
  const meanDaily = returns.reduce((sum, value) => sum + value, 0) /
    returns.length;
  const dailyVolatility = sampleStandardDeviation(returns);
  const annualizedVolatility = dailyVolatility * Math.sqrt(252);
  const sharpe = dailyVolatility === 0 ? null :
    meanDaily / dailyVolatility * Math.sqrt(252);
  const fees = result.trades.reduce((sum, trade) => sum + trade.fees, 0);
  const slippage = result.trades.reduce((sum, trade) => sum + trade.slippage, 0);
  const turnover = result.trades.reduce(
    (sum, trade) => sum + trade.notional,
    0,
  ) / result.initialCapital;
  const annualReturns = {};
  const holdingBreakdown = {};
  let annualStart = result.initialCapital;
  let activeYear = equity[0].date.slice(0, 4);
  for (let index = 0; index < equity.length; index += 1) {
    const year = equity[index].date.slice(0, 4);
    const nextYear = equity[index + 1]?.date.slice(0, 4);
    if (year !== activeYear) {
      throw new Error("Daily equity years are not ordered.");
    }
    if (nextYear !== year) {
      annualReturns[year] = equity[index].equity / annualStart - 1;
      annualStart = equity[index].equity;
      activeYear = nextYear;
    }
    const holding = equity[index].holding ?? "CASH";
    const breakdown = holdingBreakdown[holding] ?? {
      days: 0,
      compoundedReturn: 0,
    };
    breakdown.days += 1;
    breakdown.compoundedReturn =
      (1 + breakdown.compoundedReturn) * (1 + equity[index].dailyReturn) - 1;
    holdingBreakdown[holding] = breakdown;
  }
  const recovery = maxDrawdown < 0
    ? equity.find((row) =>
      row.date > drawdownTroughDate && row.equity >= drawdownPeakEquity)
    : undefined;
  return {
    startDate: equity[0].date,
    endDate: equity.at(-1).date,
    initialEquity: result.initialCapital,
    finalEquity: equity.at(-1).equity,
    totalReturn,
    cagr,
    maxDrawdown,
    drawdownPeakDate,
    drawdownTroughDate,
    drawdownRecoveryDate: recovery?.date ?? null,
    annualizedVolatility,
    sharpe,
    calmar: maxDrawdown === 0 ? null : cagr / Math.abs(maxDrawdown),
    tradeCount: result.trades.length,
    switchCount: Math.max(0, result.trades.filter((trade) =>
      trade.side === "buy").length - 1),
    turnover,
    fees,
    slippage,
    annualReturns,
    holdingBreakdown,
    equity,
  };
}

export function evaluateQualification({ strategy, benchmark, dataVerified }) {
  if (!dataVerified) {
    return { status: "UNVERIFIED", profiles: {}, reason: "Data gate failed." };
  }
  const profiles = {};
  for (const name of ["webull_current", "robinhood_current"]) {
    const candidate = strategy[name];
    const spy = benchmark[name];
    const returnPassed = candidate.totalReturn > spy.totalReturn;
    const drawdownPassed =
      Math.abs(candidate.maxDrawdown) <= Math.abs(spy.maxDrawdown);
    profiles[name] = {
      returnPassed,
      drawdownPassed,
      excessReturn: candidate.totalReturn - spy.totalReturn,
      drawdownDifference:
        Math.abs(candidate.maxDrawdown) - Math.abs(spy.maxDrawdown),
      passed: returnPassed && drawdownPassed,
    };
  }
  return {
    status: Object.values(profiles).every((profile) => profile.passed)
      ? "PASS"
      : "FAIL",
    profiles,
  };
}

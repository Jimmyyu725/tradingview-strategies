function isoDate(seconds) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Yahoo timestamp.");
  return date.toISOString().slice(0, 10);
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(label + " must contain finite OHLC values.");
  }
  return value;
}

export async function fetchYahooChart(
  symbol,
  { start, endExclusive, fetchImpl = fetch } = {},
) {
  const period1 = Math.floor(Date.parse(start + "T00:00:00Z") / 1000);
  const period2 = Math.floor(Date.parse(endExclusive + "T00:00:00Z") / 1000);
  if (!Number.isFinite(period1) || !Number.isFinite(period2) || period2 <= period1) {
    throw new Error("Yahoo date range is invalid.");
  }
  const url = new URL(
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol),
  );
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "true");
  const response = await fetchImpl(url, {
    headers: { "user-agent": "tradingview-strategies/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      "Yahoo " + symbol + " request failed with HTTP " + response.status + ".",
    );
  }
  return { url: url.toString(), payload: await response.json() };
}

export function parseYahooChart(payload, expectedSymbol) {
  if (payload?.chart?.error) {
    throw new Error("Yahoo " + expectedSymbol + " error: " +
      JSON.stringify(payload.chart.error));
  }
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
  const timestamps = result?.timestamp;
  if (result?.meta?.symbol !== expectedSymbol || !Array.isArray(timestamps)) {
    throw new Error("Yahoo " + expectedSymbol + " response identity is invalid.");
  }
  const dividends = new Map(
    Object.values(result.events?.dividends ?? {}).map((event) => [
      isoDate(event.date),
      Number(event.amount),
    ]),
  );
  const splits = new Map(
    Object.values(result.events?.splits ?? {}).map((event) => [
      isoDate(event.date),
      Number(event.numerator) / Number(event.denominator),
    ]),
  );
  const bars = timestamps.map((timestamp, index) => {
    const date = isoDate(timestamp);
    return {
      date,
      time: timestamp,
      open: finitePositive(quote?.open?.[index], "Yahoo " + expectedSymbol),
      high: finitePositive(quote?.high?.[index], "Yahoo " + expectedSymbol),
      low: finitePositive(quote?.low?.[index], "Yahoo " + expectedSymbol),
      close: finitePositive(quote?.close?.[index], "Yahoo " + expectedSymbol),
      adjustedClose: finitePositive(
        adjusted?.[index],
        "Yahoo " + expectedSymbol,
      ),
      volume: Number(quote?.volume?.[index] ?? 0),
      dividend: dividends.get(date) ?? 0,
      splitRatio: splits.get(date) ?? 1,
    };
  });
  return {
    symbol: expectedSymbol,
    timezone: result.meta.exchangeTimezoneName,
    bars,
  };
}

export function normalizeYahooSeries(parsed) {
  return {
    symbol: parsed.symbol,
    timezone: parsed.timezone,
    bars: parsed.bars.map((bar) => {
      const factor = bar.adjustedClose / bar.close;
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new Error("Yahoo " + parsed.symbol + " adjustment is invalid.");
      }
      return {
        ...bar,
        factor,
        adjustedOpen: bar.open * factor,
        adjustedHigh: bar.high * factor,
        adjustedLow: bar.low * factor,
      };
    }),
  };
}

export function reconstructTotalReturn(bars) {
  let index = 1;
  return bars.map((bar, position) => {
    if (position > 0) {
      const previous = bars[position - 1];
      const directGrossReturn = (bar.close + bar.dividend) / previous.close;
      const comparablePreviousClose = previous.close / bar.splitRatio;
      const splitAdjustedGrossReturn =
        (bar.close + bar.dividend) / comparablePreviousClose;
      const grossReturn = bar.splitRatio !== 1 &&
          Math.abs(Math.log(splitAdjustedGrossReturn)) <
            Math.abs(Math.log(directGrossReturn))
        ? splitAdjustedGrossReturn
        : directGrossReturn;
      index *= grossReturn;
    }
    return { date: bar.date, index };
  });
}

export function retainCompletedSessions(series, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const localDate = parts.year + "-" + parts.month + "-" + parts.day;
  const localMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const bars = [...series.bars];
  if (bars.at(-1)?.date === localDate && localMinute < 16 * 60 + 15) {
    bars.pop();
  }
  if (bars.length === 0) throw new Error("No completed Yahoo sessions remain.");
  return { ...series, bars };
}

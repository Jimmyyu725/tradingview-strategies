import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COST_PROFILE_NAMES,
  DATA_START,
  DEVELOPMENT_END,
  DEVELOPMENT_EVALUATION_START,
  SYMBOLS,
} from "../src/dual-momentum/config.mjs";
import { COST_PROFILES } from "../src/dual-momentum/costs.mjs";
import {
  buildDataManifest,
  DataQualityError,
  validateDataBundle,
} from "../src/dual-momentum/data.mjs";
import { computeMetrics, evaluateQualification } from "../src/dual-momentum/metrics.mjs";
import { backtestPortfolio, hypotheticalLiquidation } from "../src/dual-momentum/portfolio.mjs";
import { publishReport } from "../src/dual-momentum/report.mjs";
import {
  buildDualMomentumSignals,
  buildMonthlySmaSignals,
  buildSma200Signals,
} from "../src/dual-momentum/signals.mjs";
import { loadTradingViewBars } from "../src/dual-momentum/tradingview.mjs";
import {
  fetchYahooChart,
  normalizeYahooSeries,
  parseYahooChart,
  retainCompletedSessions,
} from "../src/dual-momentum/yahoo.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function nextIsoDate(date) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function defaultLoadYahoo({ asOf, now, fetchImpl = fetch }) {
  const normalized = {};
  const rawSources = {};
  await Promise.all(Object.entries(SYMBOLS).map(async ([key, identity]) => {
    const source = await fetchYahooChart(identity.yahoo, {
      start: DATA_START,
      endExclusive: nextIsoDate(asOf),
      fetchImpl,
    });
    rawSources[key] = source;
    normalized[key] = retainCompletedSessions(
      normalizeYahooSeries(parseYahooChart(source.payload, identity.yahoo)),
      now,
    );
    const cacheDirectory = path.join(projectRoot, "data", "cache", "dual-momentum");
    mkdirSync(cacheDirectory, { recursive: true });
    writeFileSync(
      path.join(cacheDirectory, key + "-" + asOf + ".json"),
      JSON.stringify(source.payload),
      "utf8",
    );
  }));
  return { normalized, rawSources };
}

function defaultRunTv(args) {
  const cli = process.env.TV_CLI ??
    "/home/jingtianyu/projects/tradingview-mcp/src/cli/index.js";
  return JSON.parse(execFileSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 30_000,
  }));
}

function benchmarkSignals(signalDate = "2021-12-31") {
  return [{ signalDate, target: "SPY" }];
}

function packageResult(backtest, seriesBySymbol, profile) {
  const metrics = computeMetrics(backtest);
  return {
    metrics: { ...metrics, equity: undefined },
    trades: backtest.trades,
    equity: metrics.equity,
    liquidation: hypotheticalLiquidation(backtest, seriesBySymbol, profile),
  };
}

export async function runDualMomentumBacktest(options = {}) {
  const now = options.now?.() ?? new Date();
  const asOf = now.toISOString().slice(0, 10);
  const loadYahoo = options.loadYahoo ?? defaultLoadYahoo;
  const loadTradingView = options.loadTradingView ??
    (() => loadTradingViewBars(
      Object.fromEntries(Object.entries(SYMBOLS).map(
        ([key, value]) => [key, value.tradingview],
      )),
      defaultRunTv,
      { now },
    ));
  const publish = options.publish ?? ((bundle) => publishReport(bundle, {
    outputRoot: path.join(projectRoot, "docs", "backtests"),
    runDate: asOf,
  }));
  const { normalized, rawSources } = await loadYahoo({ asOf, now });
  const tradingview = await loadTradingView();
  const dataManifest = buildDataManifest(rawSources, normalized, now);
  let quality;
  try {
    quality = validateDataBundle({ yahoo: normalized, tradingview, now });
  } catch (error) {
    if (!(error instanceof DataQualityError)) throw error;
    const bundle = {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      period: {
        start: "2022-01-03",
        end: normalized.SPY.bars.at(-1).date,
      },
      config: { symbols: SYMBOLS, dataStart: DATA_START, costProfiles: COST_PROFILES },
      quality: { verified: false, error: error.message },
      dataManifest,
      strategies: {},
      qualification: {
        status: "UNVERIFIED",
        profiles: {},
        reason: error.message,
      },
    };
    return { bundle, output: publish(bundle) };
  }
  const signalSets = {
    dual_momentum: buildDualMomentumSignals(normalized),
    sma_200: buildSma200Signals(normalized.SPY),
    sma_10m: buildMonthlySmaSignals(normalized.SPY),
    spy_buy_hold: benchmarkSignals(),
  };
  const strategies = {};
  for (const [strategyName, signals] of Object.entries(signalSets)) {
    strategies[strategyName] = {};
    for (const profileName of COST_PROFILE_NAMES) {
      const profile = COST_PROFILES[profileName];
      const backtest = backtestPortfolio({
        seriesBySymbol: normalized,
        signals,
        costProfile: profile,
      });
      strategies[strategyName][profileName] =
        packageResult(backtest, normalized, profile);
    }
  }
  const qualification = evaluateQualification({
    strategy: Object.fromEntries(COST_PROFILE_NAMES.map((name) => [
      name, strategies.dual_momentum[name].metrics,
    ])),
    benchmark: Object.fromEntries(COST_PROFILE_NAMES.map((name) => [
      name, strategies.spy_buy_hold[name].metrics,
    ])),
    dataVerified: quality.verified,
  });
  const developmentProfile = COST_PROFILES.zero_cost;
  // 2008 is retained as warm-up; 2009-02-02 is the first executable 12M signal.
  const developmentDual = backtestPortfolio({
    seriesBySymbol: normalized,
    signals: signalSets.dual_momentum,
    costProfile: developmentProfile,
    startDate: DEVELOPMENT_EVALUATION_START,
    endDate: DEVELOPMENT_END,
  });
  const developmentSpy = backtestPortfolio({
    seriesBySymbol: normalized,
    signals: benchmarkSignals("2009-01-30"),
    costProfile: developmentProfile,
    startDate: DEVELOPMENT_EVALUATION_START,
    endDate: DEVELOPMENT_END,
  });
  const bundle = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    period: {
      start: strategies.dual_momentum.zero_cost.metrics.startDate,
      end: quality.latestCommonDate,
    },
    config: {
      symbols: SYMBOLS,
      dataStart: DATA_START,
      costProfiles: COST_PROFILES,
    },
    quality,
    dataManifest,
    signals: signalSets,
    developmentSanity: {
      period: {
        start: DEVELOPMENT_EVALUATION_START,
        end: DEVELOPMENT_END,
      },
      costProfile: "zero_cost",
      dualMomentum:
        packageResult(developmentDual, normalized, developmentProfile).metrics,
      spyBuyHold:
        packageResult(developmentSpy, normalized, developmentProfile).metrics,
      selectionUsed: false,
    },
    strategies,
    qualification,
  };
  return { bundle, output: publish(bundle) };
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  runDualMomentumBacktest()
    .then(({ bundle, output }) => {
      process.stdout.write(JSON.stringify({
        status: bundle.qualification.status,
        period: bundle.period,
        output: output.directory,
      }) + "\n");
      if (bundle.qualification.status === "UNVERIFIED") process.exitCode = 2;
    })
    .catch((error) => {
      process.stderr.write(error.stack + "\n");
      process.exitCode = 1;
    });
}

// StockService.js — all API calls extracted from api.js

import { cacheGet, cacheSet, cacheGetStale, fundGet, fundSet, fullCacheGet, fullCacheSet } from './CacheService.js';

function getTwelveKey()  { return localStorage.getItem('bon-twelve-key')  || '798a2840ddf04904b15da7c1a66fc973'; }
function getFmpKey()     { return localStorage.getItem('bon-fmp-key')     || ''; }
function getAvKey()      { return localStorage.getItem('bon-av-key')      || ''; }
function getFinnhubKey() { return localStorage.getItem('bon-finnhub-key') || 'd6qup2hr01qgdhqcgpbgd6qup2hr01qgdhqcgpc0'; }

// ── SEC EDGAR fundamentals (free, no API key, works from any IP) ──────────────
// Covers US stocks that file with the SEC (10-K / 20-F).
// CIK numbers sourced from: https://www.sec.gov/files/company_tickers.json
const EDGAR_CIK = {
  AAPL:'320193',MSFT:'789019',GOOGL:'1652044',GOOG:'1652044',AMZN:'1018724',
  NVDA:'1045810',META:'1326801',TSLA:'1318605',AVGO:'1730168',V:'1403161',
  MA:'1141391',JPM:'19617',UNH:'731766',LLY:'59478',HD:'354950',MRK:'310158',
  ABBV:'1551152',COST:'909832',JNJ:'200406',BAC:'70858',WMT:'104169',
  XOM:'34088',PG:'80424',WFC:'72971',AMD:'2488',ORCL:'1341439',
  NFLX:'1065280',CRM:'1108524',INTC:'50863',CSCO:'858877',QCOM:'804328',
  PFE:'78003',TXN:'97476',IBM:'51143',GS:'886982',MS:'895421',
  DIS:'1001039',KO:'21344',PEP:'77476',CAT:'18230',CVX:'93410',
  GE:'40533',MCD:'63908',BA:'12927',PYPL:'1633917',UBER:'1543151',
  ABNB:'1559720',PLTR:'1321655',SNOW:'1640147',T:'732717',VZ:'732712',
  MRNA:'1682852',MU:'723254',AMAT:'796343',LRCX:'707549',KLAC:'319201',
  ADI:'6951',MRVL:'1058057',ON:'861284',CDNS:'813672',SNPS:'883241',
  ENPH:'1463101',FSLR:'1274439',RIVN:'1874178',NIO:'1736541',
  WBD:'1437491',CMCSA:'1166691',NTNX:'1468174',AMC:'1411579',GME:'1326380',
  TEVA:'818686',CHWY:'1661181',DASH:'1792789',COIN:'1679788',HOOD:'1783398',
  SOFI:'1403708',AFRM:'1820175',UPST:'1647639',LCID:'1811210',
  BP:'313807',CVS:'1547903',WBA:'105378',ABBV:'1551152',
  ELV:'1156039',CI:'723254',HCA:'860731',MDT:'310764',ABT:'1800',
  TMO:'97210',DHR:'790070',SYK:'310764',ZTS:'1555280',ISRG:'1035267',
  REGN:'872589',VRTX:'875320',GILD:'882095',BIIB:'875045',
  NEE:'753308',DUK:'18978',SO:'92521',AEP:'4904',SRE:'1032975',
  PLD:'1045609',AMT:'1053507',EQIX:'1101239',PSA:'77890',SPG:'1063761',
  SBUX:'829224',TGT:'27419',LOW:'60667',NKE:'320187',TJX:'109198',
  BKNG:'1075531',EXPE:'1324424',MAR:'1048268',HLT:'1466132',H:'313131',
};

// Fetch one EDGAR concept's latest annual value.
async function _edgarLatest(cik, concept, unit = 'USD') {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${String(cik).padStart(10,'0')}/us-gaap/${concept}.json`;
  const res = await fetchWithTimeout(proxyUrl(url), 10000);
  if (!res.ok) return [null, null];
  const j = await res.json();
  const arr = (j?.units?.[unit] ?? [])
    .filter(d => (d.form === '10-K' || d.form === '20-F') && d.val != null)
    .sort((a, b) => b.end.localeCompare(a.end));
  return [arr[0]?.val ?? null, arr[1]?.val ?? null]; // [latest, previous annual]
}

// Returns partial fundamentals from SEC EDGAR (no API key needed).
// Only covers US stocks in EDGAR_CIK map. Returns null for unknown symbols.
async function fetchEdgarFundamentals(symbol, price) {
  const cik = EDGAR_CIK[symbol.toUpperCase()];
  if (!cik || !price) return null;

  try {
    // Fetch EPS, Revenue (try two common concept names), Equity, Shares, Debt in parallel
    const [
      [eps,    epsPrev],
      [rev,    revPrev],
      [rev2,   rev2Prev],
      [rev3,   ],
      [equity, ],
      [shares, ],
      [debt,   ],
      [dps,    ],
      [dpsCashPaid, ],
      [operatingCF, ],
      [capex,       ],
      [operatingIncome, ],
    ] = await Promise.all([
      _edgarLatest(cik, 'EarningsPerShareDiluted',                              'USD/shares'),
      _edgarLatest(cik, 'Revenues'),
      _edgarLatest(cik, 'RevenueFromContractWithCustomerExcludingAssessedTax'),
      _edgarLatest(cik, 'RevenuesNetOfInterestExpense'),  // banks
      _edgarLatest(cik, 'StockholdersEquity'),
      _edgarLatest(cik, 'CommonStockSharesOutstanding', 'shares'),
      _edgarLatest(cik, 'LongTermDebt'),
      _edgarLatest(cik, 'CommonStockDividendsPerShareDeclared', 'USD/shares'),
      _edgarLatest(cik, 'CommonStockDividendsPerShareCashPaid', 'USD/shares'),
      _edgarLatest(cik, 'NetCashProvidedByUsedInOperatingActivities'),
      _edgarLatest(cik, 'PaymentsToAcquirePropertyPlantAndEquipment'),
      _edgarLatest(cik, 'OperatingIncomeLoss'),
    ]);
    const dpsActual = dps ?? dpsCashPaid;

    const revActual     = rev     ?? rev2     ?? rev3;
    const revPrevActual = revPrev ?? rev2Prev ?? null;

    const pe = (eps && eps > 0)                             ? +(price / eps).toFixed(2)                           : null;
    const pb = (equity && shares && shares > 0)             ? +(price / (equity / shares)).toFixed(2)             : null;
    const ps = (revActual && shares && shares > 0)          ? +(price / (revActual / shares)).toFixed(2)          : null;
    const revenueGrowth = (revActual && revPrevActual && revPrevActual !== 0)
      ? +((revActual - revPrevActual) / Math.abs(revPrevActual) * 100).toFixed(2) : null;
    const epsGrowth = (eps && epsPrev && epsPrev > 0)
      ? +((eps - epsPrev) / epsPrev * 100).toFixed(2) : null; // skip if base year was a loss
    const debtEquity = (debt != null && equity && equity !== 0)
      ? +(debt / equity).toFixed(4) : null;
    // FCF = Operating Cash Flow − CapEx
    const fcfEdgar = (operatingCF != null && capex != null) ? operatingCF - capex
                   : operatingCF != null ? operatingCF : null;
    // Operating Margin = Operating Income / Revenue
    const opMarginEdgar = (operatingIncome != null && revActual && revActual !== 0)
      ? (operatingIncome / revActual) : null; // decimal, e.g. 0.30 for 30%

    // Return in v10-compatible shape so parseAllData works unchanged
    return {
      summaryDetail: {
        trailingPE:    pe,
        priceToBook:   pb,
        beta:          null,
        marketCap:     (shares && price) ? shares * price : null,
        dividendYield: (dpsActual && price && price > 0) ? dpsActual / price : null,
      },
      defaultKeyStatistics: {
        priceToSalesTrailing12Months: ps,
        heldPercentInstitutions:      null,
      },
      financialData: {
        earningsGrowth:          epsGrowth     != null ? epsGrowth     / 100 : null,
        revenueGrowth:           revenueGrowth != null ? revenueGrowth / 100 : null,
        debtToEquity:            debtEquity    != null ? debtEquity    * 100  : null,
        freeCashflow:            fcfEdgar,
        operatingMargins:        opMarginEdgar,
        targetMeanPrice:         null,
        targetHighPrice:         null,
        targetLowPrice:          null,
        recommendationMean:      null,
        numberOfAnalystOpinions: null,
      },
      assetProfile: { longName: null, sector: null, industry: null },
      calendarEvents: { earnings: { earningsDate: [] } },
      _edgarSource: true,
    };
  } catch {
    return null;
  }
}

// ── Financial Modeling Prep (FMP) fallback ────────────────────────────────────
// Free tier: 250 req/day. Key stored in localStorage as 'bon-fmp-key'.
// Called when Yahoo Finance HTML scrape fails (e.g. GDPR consent wall on IL/EU IPs).
async function fetchFMPFundamentals(symbol) {
  const key = getFmpKey();
  if (!key) return null;

  const base = `https://financialmodelingprep.com/api/v3`;
  const qs   = `apikey=${key}`;

  // Fetch profile + key-metrics + income growth in parallel
  const [profileRaw, metricsRaw, growthRaw, analystRaw, targetRaw] = await Promise.all([
    fetchWithTimeout(`${base}/profile/${encodeURIComponent(symbol)}?${qs}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/key-metrics-ttm/${encodeURIComponent(symbol)}?${qs}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/income-statement-growth/${encodeURIComponent(symbol)}?limit=1&${qs}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/analyst-stock-recommendations/${encodeURIComponent(symbol)}?${qs}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/price-target-consensus/${encodeURIComponent(symbol)}?${qs}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const prof    = Array.isArray(profileRaw) ? profileRaw[0] : null;
  const metrics = Array.isArray(metricsRaw) ? metricsRaw[0] : null;
  const growth  = Array.isArray(growthRaw)  ? growthRaw[0]  : null;

  if (!prof && !metrics) return null;

  // Map analyst recommendations to our internal format
  let analystScore = null;
  if (Array.isArray(analystRaw) && analystRaw.length > 0) {
    const counts = { strongBuy: 0, buy: 0, hold: 0, sell: 0 };
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const r of analystRaw) {
      if (r.date < cutoff) continue;
      const rc = (r.analystRatingsStrongBuy ?? 0);
      const rb = (r.analystRatingsbuy      ?? 0);
      const rh = (r.analystRatingsHold     ?? 0);
      const rs = (r.analystRatingsSell     ?? 0) + (r.analystRatingsStrongSell ?? 0);
      counts.strongBuy += rc;
      counts.buy       += rb;
      counts.hold      += rh;
      counts.sell      += rs;
    }
    const total = counts.strongBuy + counts.buy + counts.hold + counts.sell;
    if (total > 0) analystScore = counts;
  }

  // Map to v10 quoteSummary structure so parseAllData works unchanged
  return {
    summaryDetail: {
      trailingPE:   metrics?.peRatioTTM    ?? null,
      priceToBook:  metrics?.pbRatioTTM    ?? null,
      beta:         prof?.beta             ?? null,
      marketCap:    prof?.mktCap           ?? null,
      dividendYield: prof?.lastDiv != null && prof.price
        ? prof.lastDiv / prof.price : null,
    },
    defaultKeyStatistics: {
      priceToSalesTrailing12Months: metrics?.priceToSalesRatioTTM ?? null,
      heldPercentInstitutions:      null,
      pegRatio:                     metrics?.pegRatioTTM ?? null,
    },
    financialData: {
      earningsGrowth:          growth?.growthEPS      != null ? growth.growthEPS      : null,
      revenueGrowth:           growth?.growthRevenue  != null ? growth.growthRevenue  : null,
      debtToEquity:            metrics?.debtToEquityTTM != null ? metrics.debtToEquityTTM * 100 : null,
      returnOnEquity:          metrics?.returnOnEquityTTM ?? null,
      currentRatio:            metrics?.currentRatioTTM  ?? null,
      freeCashflow:            metrics?.freeCashFlowTTM  ?? null,
      operatingMargins:        metrics?.operatingProfitMarginTTM ?? null, // decimal (0–1), same format as Yahoo v10
      targetMeanPrice:         targetRaw?.targetConsensus  ?? null,
      targetHighPrice:         targetRaw?.targetHigh        ?? null,
      targetLowPrice:          targetRaw?.targetLow         ?? null,
      recommendationMean:      null,
      numberOfAnalystOpinions: null,
    },
    assetProfile: {
      longName: prof?.companyName ?? null,
      sector:   prof?.sector      ?? null,
      industry: prof?.industry    ?? null,
    },
    calendarEvents: { earnings: { earningsDate: [] } },
    // Attach raw analystScore so parseAllData can use it
    _fmpAnalystScore: analystScore,
  };
}

// ── Finnhub fundamentals ──────────────────────────────────────────────────────
// Free tier: 60 calls/min. Covers PE, PB, PS, Beta, Dividend, EPS/Revenue growth,
// Debt/Equity, Earnings calendar, Analyst recommendations.
// Key stored in localStorage as 'bon-finnhub-key'.
async function fetchFinnhubFundamentals(symbol) {
  const key = getFinnhubKey();
  const base = `https://finnhub.io/api/v1`;
  const from = new Date().toISOString().slice(0, 10);
  const to   = new Date(Date.now() + 270 * 86400000).toISOString().slice(0, 10);

  const [profileRaw, metricRaw, earningsRaw, recommendRaw, priceTargetRaw, epsHistRaw] = await Promise.all([
    fetchWithTimeout(`${base}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/calendar/earnings?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${key}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${key}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/stock/price-target?symbol=${encodeURIComponent(symbol)}&token=${key}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${base}/stock/earnings?symbol=${encodeURIComponent(symbol)}&limit=4&token=${key}`, 8000)
      .then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const m = metricRaw?.metric || {};
  if (!m.peBasicExclExtraTTM && !m.peTTM && !profileRaw?.marketCapitalization) return null;

  // Map analyst recommendations
  let analystScore = null;
  if (Array.isArray(recommendRaw) && recommendRaw.length > 0) {
    const latest = recommendRaw[0];
    const total = (latest.strongBuy || 0) + (latest.buy || 0) + (latest.hold || 0) + (latest.sell || 0) + (latest.strongSell || 0);
    if (total > 0) {
      analystScore = {
        strongBuy: latest.strongBuy || 0,
        buy:       latest.buy       || 0,
        hold:      latest.hold      || 0,
        sell:      (latest.sell || 0) + (latest.strongSell || 0),
      };
    }
  }

  // Earnings date
  const earningsArr = earningsRaw?.earningsCalendar || [];
  const nextEarning = earningsArr.find(e => e.date && new Date(e.date) > new Date());

  const pe  = m.peBasicExclExtraTTM ?? m.peTTM ?? null;
  const pb  = m.pbAnnual ?? m.pbQuarterly ?? null;
  const ps  = m.psAnnual ?? m.psTTM ?? null;
  const beta = m.beta ?? null;
  const divYield = m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual / 100 : null;
  const marketCap = profileRaw?.marketCapitalization != null ? profileRaw.marketCapitalization * 1e6 : null;
  const epsGrowth = m.epsGrowth3Y ?? null; // epsBasicExclExtraItemsTTM is an absolute EPS value, not a growth rate
  const revGrowth = m.revenueGrowth3Y ?? m.revenueGrowthTTMYoy ?? null;
  // Note: Finnhub metric keys use '/' not '_' as separator
  const debtEq    = m['longTermDebt/equityAnnual'] ?? m['totalDebt/totalEquityAnnual'] ?? null;
  const instPct      = m.institutionalOwnershipPercentage != null ? m.institutionalOwnershipPercentage / 100 : null;
  const roe          = m.roeTTM != null ? m.roeTTM / 100 : null;   // convert % → decimal
  const currentRatio = m.currentRatioAnnual ?? m.currentRatioQuarterly ?? null;
  // New fields for 4-family model — correct Finnhub key names
  const operatingMarginFinnhub = m.operatingMarginTTM ?? m.operatingMarginAnnual ?? null; // already in %
  const insiderPctFinnhub      = m.insiderOwnershipPercentage != null ? m.insiderOwnershipPercentage / 100 : null;
  // FCF: Finnhub provides P/FCF (pfcfShareTTM) but not absolute FCF.
  // Compute synthetic FCF = marketCap / pfcfShareTTM (≈ absolute FCF in $).
  const pfcfTTM = m.pfcfShareTTM ?? m.pfcfShareAnnual ?? null;
  const syntheticFCF = (pfcfTTM != null && pfcfTTM > 0 && marketCap != null)
    ? marketCap / pfcfTTM : null;
  // EPS Surprise: most recent quarter with both actual + estimate
  const epsHistArr  = Array.isArray(epsHistRaw) ? epsHistRaw : [];
  const latestEPS   = epsHistArr.find(e => e.actual != null && e.estimate != null && e.estimate !== 0);
  const epsSurprise = latestEPS
    ? ((latestEPS.actual - latestEPS.estimate) / Math.abs(latestEPS.estimate)) * 100
    : null;

  return {
    summaryDetail: {
      trailingPE:    pe,
      priceToBook:   pb,
      beta:          beta,
      marketCap:     marketCap,
      dividendYield: divYield,
    },
    defaultKeyStatistics: {
      priceToSalesTrailing12Months: ps,
      heldPercentInstitutions:      instPct,
      heldPercentInsiders:          insiderPctFinnhub,
      pegRatio:                     null,   // Finnhub metric=all doesn't provide PEG
    },
    financialData: {
      earningsGrowth:          epsGrowth != null ? epsGrowth / 100 : null,
      revenueGrowth:           revGrowth != null ? revGrowth / 100 : null,
      debtToEquity:            debtEq != null ? debtEq * 100 : null,
      returnOnEquity:          roe,
      currentRatio:            currentRatio,
      freeCashflow:            syntheticFCF,
      operatingMargins:        operatingMarginFinnhub != null ? operatingMarginFinnhub / 100 : null,
      targetMeanPrice:         priceTargetRaw?.targetMean   ?? null,
      targetHighPrice:         priceTargetRaw?.targetHigh   ?? null,
      targetLowPrice:          priceTargetRaw?.targetLow    ?? null,
      recommendationMean:      null,
      numberOfAnalystOpinions: null,
    },
    assetProfile: {
      longName: profileRaw?.name    ?? null,
      sector:   profileRaw?.finnhubIndustry ?? null,
    },
    calendarEvents: {
      earnings: {
        earningsDate: nextEarning ? [{ raw: new Date(nextEarning.date).getTime() / 1000 }] : [],
      },
    },
    _finnhubAnalystScore: analystScore,
    _finnhubSource: true,
    _epsSurprise: epsSurprise,
  };
}

// ── Alpha Vantage fallback ────────────────────────────────────────────────────
// Free tier: 25 req/day. OVERVIEW endpoint returns all fundamentals in one call.
// Key stored in localStorage as 'bon-av-key'. Register free at alphavantage.co.
async function fetchAVFundamentals(symbol) {
  const key = getAvKey();
  if (!key) return null;

  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
  let d;
  try {
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return null;
    d = await res.json();
  } catch { return null; }

  if (!d?.Symbol || d?.Information) return null; // demo key restriction or error

  const n = (v) => v != null && v !== 'None' && v !== '-' ? +v : null;

  const strongBuy = n(d.AnalystRatingStrongBuy) ?? 0;
  const buy       = n(d.AnalystRatingBuy)        ?? 0;
  const hold      = n(d.AnalystRatingHold)        ?? 0;
  const sell      = (n(d.AnalystRatingSell) ?? 0) + (n(d.AnalystRatingStrongSell) ?? 0);
  const total     = strongBuy + buy + hold + sell;
  const analystScore = total > 0 ? { strongBuy, buy, hold, sell } : null;

  return {
    summaryDetail: {
      trailingPE:   n(d.TrailingPE),
      priceToBook:  n(d.PriceToBookRatio),
      beta:         n(d.Beta),
      marketCap:    n(d.MarketCapitalization),
      dividendYield: n(d.DividendYield),
    },
    defaultKeyStatistics: {
      priceToSalesTrailing12Months: n(d.PriceToSalesRatioTTM),
      heldPercentInstitutions: null,
    },
    financialData: {
      earningsGrowth:          n(d.QuarterlyEarningsGrowthYOY),
      revenueGrowth:           n(d.QuarterlyRevenueGrowthYOY),
      debtToEquity:            null, // not in OVERVIEW
      targetMeanPrice:         n(d.AnalystTargetPrice),
      targetHighPrice:         null,
      targetLowPrice:          null,
      recommendationMean:      null,
      numberOfAnalystOpinions: null,
    },
    assetProfile: {
      longName: d.Name   ?? null,
      sector:   d.Sector ?? null,
      industry: d.Industry ?? null,
    },
    calendarEvents: { earnings: { earningsDate: [] } },
    _fmpAnalystScore: analystScore,
  };
}

// ── CORS Proxy configuration ─────────────────────────────────
// Our own Cloudflare Worker proxy — set after deploying cloudflare-worker/worker.js
// Replace the URL below with your actual Worker URL from Cloudflare dashboard
const CF_WORKER = localStorage.getItem('bon-proxy-url') || 'https://bulltherapy-proxy.oranmikell.workers.dev';

// Build proxy URL: Worker expects ?url=<encoded>
function proxyUrl(target) {
  return `${CF_WORKER}?url=${encodeURIComponent(target)}`;
}

export function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export async function fetchProxy(url) {
  const res = await fetchWithTimeout(proxyUrl(url));
  if (!res.ok) throw new Error(res.status);
  const text = await res.text();
  return JSON.parse(text);
}

export async function fetchProxyRaw(url) {
  const res = await fetchWithTimeout(proxyUrl(url));
  if (!res.ok) throw new Error(res.status);
  return res.text();
}

export async function yahooChart(symbol, range = '1d', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;
  return fetchProxy(url);
}

export async function yahooNewsSearch(symbol) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=10&enableNavLinks=false`;
  return fetchProxy(url);
}

// Fetch current price and daily % change for a market index (e.g. '^GSPC', '^IXIC')
export async function fetchIndexQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`;
    const data = await fetchProxy(url);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? null;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const changePct = meta.regularMarketChangePercent != null
      ? meta.regularMarketChangePercent
      : (price != null && prevClose != null && prevClose !== 0)
        ? ((price - prevClose) / prevClose) * 100
        : null;
    return { price, changePct };
  } catch {
    return null;
  }
}

// Convert flat Yahoo Finance v7 quote object into the nested v10 structure
// that parseAllData expects.
function _v7ToV10(q) {
  return {
    summaryDetail: {
      trailingPE:   q.trailingPE   ?? null,
      priceToBook:  q.priceToBook  ?? null,
      beta:         q.beta         ?? null,
      marketCap:    q.marketCap    ?? null,
      dividendYield: q.trailingAnnualDividendYield ?? q.dividendYield ?? null,
    },
    defaultKeyStatistics: {
      priceToSalesTrailing12Months: q.trailingPriceToSales ?? null,
      heldPercentInstitutions:      q.heldPercentInstitutions ?? null,
      heldPercentInsiders:          q.heldPercentInsiders ?? null,
      shortPercentOfFloat:          q.shortPercentOfFloat ?? null,
      pegRatio:                     q.pegRatio ?? null,
    },
    financialData: {
      earningsGrowth:           q.earningsGrowth           ?? null,
      revenueGrowth:            q.revenueGrowth            ?? null,
      debtToEquity:             q.debtToEquity             ?? null,
      returnOnEquity:           q.returnOnEquity           ?? null,
      currentRatio:             q.currentRatio             ?? null,
      freeCashflow:             q.freeCashflow             ?? null,
      targetMeanPrice:          q.targetMeanPrice          ?? null,
      targetHighPrice:          q.targetHighPrice          ?? null,
      targetLowPrice:           q.targetLowPrice           ?? null,
      recommendationMean:       q.recommendationMean       ?? null,
      numberOfAnalystOpinions:  q.numberOfAnalystOpinions  ?? null,
    },
    calendarEvents: {
      earnings: {
        earningsDate: q.earningsTimestampStart ? [q.earningsTimestampStart] : [],
      },
    },
    assetProfile: {
      longName: q.longName ?? q.shortName ?? null,
      sector:   q.sector   ?? null,
      industry: q.industry ?? null,
    },
  };
}

export async function yahooFundamentals(symbol) {
  // ── 1. HTML page scraping (no crumb needed) ─────────────────────────────
  // The Worker intercepts finance.yahoo.com/quote/ requests, extracts the
  // full quoteSummary embedded in the SvelteKit data island, and returns JSON.
  try {
    const raw = await fetchProxy(`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`);
    const result = raw?.quoteSummary?.result?.[0];
    if (result && !raw?.quoteSummary?.error) return result;
  } catch {}

  // ── 2. v7/finance/quote (flat response, may be blocked) ─────────────────
  // v7 is missing heldPercentInsiders, shortPercentOfFloat, pegRatio — always
  // fall through to v10 so those fields get populated. Save v7 as fallback.
  let v7Result = null;
  try {
    const fields = [
      'trailingPE','forwardPE','marketCap','beta','priceToBook',
      'trailingPriceToSales','trailingAnnualDividendYield','dividendYield',
      'recommendationMean','numberOfAnalystOpinions',
      'targetMeanPrice','targetHighPrice','targetLowPrice',
      'earningsTimestampStart','earningsTimestampEnd',
      'earningsGrowth','revenueGrowth','debtToEquity',
      'returnOnEquity','currentRatio','freeCashflow',
      'heldPercentInstitutions','heldPercentInsiders','shortPercentOfFloat',
      'pegRatio','sector','industry','longName','shortName',
    ].join(',');
    const raw7 = await fetchProxy(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=${fields}`
    );
    const q = raw7?.quoteResponse?.result?.[0];
    if (q?.symbol) v7Result = _v7ToV10(q);
  } catch {}

  // ── 3. v10/quoteSummary via worker crumb-auth ────────────────────────────
  // The Cloudflare Worker now performs the Yahoo Finance cookie+crumb handshake
  // automatically before forwarding the v10 request.
  // v10 returns all modules including heldPercentInsiders, shortPercentOfFloat, etc.
  const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents';
  for (const host of ['query1', 'query2']) {
    try {
      const raw = await fetchProxy(
        `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&formatted=false&corsDomain=finance.yahoo.com`
      );
      const result = raw?.quoteSummary?.result?.[0];
      if (result && !raw?.quoteSummary?.error) return result;
    } catch {}
  }

  // v10 failed — return v7 partial data if we have it
  if (v7Result) return v7Result;

  return null;
}

async function tdGet(endpoint) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `https://api.twelvedata.com/${endpoint}${sep}apikey=${getTwelveKey()}`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) throw new Error(res.status);
  const json = await res.json();
  if (json.code >= 400 || json.status === 'error') throw new Error(json.message || json.code);
  return json;
}

export async function tdStatistics(symbol) {
  return tdGet(`statistics?symbol=${encodeURIComponent(symbol)}`);
}

export async function tdAnalystRatings(symbol) {
  return tdGet(`analyst_ratings/light?symbol=${encodeURIComponent(symbol)}`);
}

export async function tdPriceTarget(symbol) {
  return tdGet(`price_target?symbol=${encodeURIComponent(symbol)}`);
}

export async function tdEarnings(symbol) {
  return tdGet(`earnings?symbol=${encodeURIComponent(symbol)}`);
}

// Alpha Vantage earnings calendar — no API key required, returns CSV
async function fetchAvEarnings(symbol) {
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${encodeURIComponent(symbol)}&horizon=3month`;
  const res = await fetchWithTimeout(proxyUrl(url), 8000);
  if (!res.ok) return null;
  const csv = await res.text();
  // CSV header: symbol,name,reportDate,fiscalDateEnding,estimate,currency
  const lines = csv.trim().split('\n').slice(1); // skip header
  const earnings = lines
    .map(line => {
      const cols = line.split(',');
      return cols[2] ? { date: cols[2].trim() } : null;
    })
    .filter(e => e && e.date && new Date(e.date) > new Date());
  return earnings.length > 0 ? { earnings } : null;
}

// Estimate next earnings date from EDGAR 10-Q/10-K filing history.
// Large companies announce earnings 3-5 days before their SEC filing,
// so next_earnings ≈ projected_next_filing - 5 days.
async function estimateNextEarningsFromEdgar(cik) {
  if (!cik) return null;
  const paddedCik = String(cik).padStart(10, '0');
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  const res = await fetchWithTimeout(proxyUrl(url), 10000);
  if (!res.ok) return null;
  const j = await res.json();
  const forms = j?.filings?.recent?.form || [];
  const dates = j?.filings?.recent?.filingDate || [];
  const filingDates = [];
  for (let i = 0; i < forms.length && filingDates.length < 5; i++) {
    if (forms[i] === '10-Q' || forms[i] === '10-K') {
      filingDates.push(new Date(dates[i]));
    }
  }
  if (filingDates.length < 2) return null;
  // Average interval between filings (in ms)
  let totalInterval = 0;
  for (let i = 0; i < filingDates.length - 1; i++) {
    totalInterval += filingDates[i] - filingDates[i + 1];
  }
  const avgInterval = totalInterval / (filingDates.length - 1);
  const nextFiling = new Date(filingDates[0].getTime() + avgInterval);
  // Earnings are announced ~5 days before the 10-Q/10-K filing
  const estimatedEarnings = new Date(nextFiling.getTime() - 5 * 86400000);
  // Only return if the estimated date is in the future
  if (estimatedEarnings <= new Date()) return null;
  const dateStr = estimatedEarnings.toISOString().slice(0, 10);
  return { earnings: [{ date: dateStr }] };
}

// ── Finviz scraping — institutional ownership + target price ─────────────────
// Finviz is a free financial site with no API key requirement.
// The Worker handles HTML parsing and returns structured JSON.
async function fetchFinvizData(symbol) {
  try {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}&ty=c&ta=1&p=d`;
    const res = await fetchWithTimeout(proxyUrl(url), 8000);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error) return null;
    // Only return if we got meaningful data
    if (data.instOwn == null && data.targetPrice == null) return null;
    return data;
  } catch { return null; }
}

const TRENDING_DEFAULTS = ['AAPL', 'TSLA', 'NVDA', 'AMZN', 'MSFT'];

export async function fetchTrending() {
  try {
    const url  = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=5&formatted=false';
    const res  = await fetchWithTimeout(proxyUrl(url), 8000);
    if (!res.ok) throw new Error('screener fail');
    const json = await res.json();
    const quotes = json?.finance?.result?.[0]?.quotes;
    if (!quotes?.length) throw new Error('no quotes');
    return quotes.map(q => q.symbol).filter(Boolean).slice(0, 5);
  } catch {
    return TRENDING_DEFAULTS;
  }
}

export function isCryptoSymbol(symbol) {
  return /^[A-Z0-9]+-(?:USD|USDT|USDC|BTC|ETH|EUR|GBP)$/i.test(symbol);
}

export function aggregateRatings(ratingsData) {
  if (!ratingsData?.ratings?.length) return null;

  const byFirm = new Map();
  for (const r of ratingsData.ratings) {
    if (!byFirm.has(r.firm) || r.date > byFirm.get(r.firm).date) {
      byFirm.set(r.firm, r);
    }
  }

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recent = [...byFirm.values()].filter(r => r.date >= cutoff);
  if (!recent.length) return null;

  const counts = { strongBuy: 0, buy: 0, hold: 0, sell: 0 };
  const STRONG_BUY = ['strong buy', 'top pick'];
  const BUY_WORDS  = ['buy', 'outperform', 'overweight', 'accumulate', 'positive'];
  const HOLD_WORDS = ['hold', 'neutral', 'equal', 'market perform', 'sector perform', 'sector weight', 'in-line'];

  for (const r of recent) {
    const rc = (r.rating_current || '').toLowerCase();
    if (STRONG_BUY.some(w => rc.includes(w))) counts.strongBuy++;
    else if (BUY_WORDS.some(w => rc.includes(w)))   counts.buy++;
    else if (HOLD_WORDS.some(w => rc.includes(w)))  counts.hold++;
    else counts.sell++;
  }

  const total = counts.strongBuy + counts.buy + counts.hold + counts.sell;
  return total > 0 ? counts : null;
}

export function parseAllData({ meta, yfFund, stats, ratings, target, earning, newsResp, finviz }, symbol) {
  const yfSum  = yfFund?.summaryDetail        || {};
  const yfDef  = yfFund?.defaultKeyStatistics || {};
  const yfFin  = yfFund?.financialData        || {};
  // assetProfile (v10 direct) OR summaryProfile (embedded via HTML scrape)
  const yfProf = yfFund?.assetProfile ?? yfFund?.summaryProfile ?? {};
  const yfCal  = yfFund?.calendarEvents       || {};
  // price module (present in HTML-scraped data) — extra fallbacks for name/cap
  const yfPrice = yfFund?.price || {};

  const st  = stats?.statistics || {};
  const val = st.valuations_metrics || {};
  const fin = st.financials || {};
  const inc = fin.income_statement || {};
  const bal = fin.balance_sheet || {};
  const sps = st.stock_price_summary || {};
  const sst = st.stock_statistics || {};
  const div = st.dividends_and_splits || {};

  const isCrypto    = isCryptoSymbol(symbol);
  const isTASE      = symbol.endsWith('.TA');
  const marketState = isCrypto ? 'REGULAR' : (meta.marketState ?? 'CLOSED');

  const price     = meta.regularMarketPrice    ?? null;
  const prevClose = meta.chartPreviousClose    ?? meta.regularMarketPreviousClose ?? null;
  const change    = (price != null && prevClose) ? price - prevClose : null;
  // Prefer Yahoo's own regularMarketChangePercent — it correctly reflects the last
  // session's change even when the market is closed (weekends/holidays).
  // Fall back to computed value only when Yahoo doesn't provide it.
  const changePct = meta.regularMarketChangePercent != null
    ? meta.regularMarketChangePercent
    : (change != null && prevClose) ? (change / prevClose) * 100 : null;
  const currency  = meta.currency    ?? 'USD';
  const exchange  = meta.exchangeName ?? meta.fullExchangeName ?? null;

  const name   = yfProf.longName ?? yfPrice.longName?.raw ?? yfPrice.longName
               ?? stats?.meta?.name ?? meta.longName ?? meta.shortName ?? symbol;
  const sectorFromSearch = newsResp?.quotes?.find(q => q.symbol === symbol)?.sector || null;
  const sector      = yfProf.sector ?? sectorFromSearch ?? null;
  const industry    = yfProf.industry ?? null;
  const description = yfProf.longBusinessSummary ?? null;
  const employees   = yfProf.fullTimeEmployees ?? null;
  const website     = yfProf.website ?? null;
  const country     = yfProf.country ?? null;

  const marketCap = yfSum.marketCap?.raw ?? yfSum.marketCap
                 ?? yfPrice.marketCap?.raw ?? yfPrice.marketCap
                 ?? val.market_capitalization
                 ?? meta?.marketCap ?? null;
  const pe        = yfSum.trailingPE?.raw        ?? yfSum.trailingPE        ?? val.trailing_pe            ?? null;
  const pb        = yfSum.priceToBook?.raw       ?? yfSum.priceToBook       ?? val.price_to_book_mrq     ?? null;
  const ps        = yfDef.priceToSalesTrailing12Months?.raw
                    ?? yfDef.priceToSalesTrailing12Months
                    ?? val.price_to_sales_ttm ?? null;

  const beta    = yfSum.beta?.raw ?? yfSum.beta ?? sps.beta ?? null;
  const high52w = sps.fifty_two_week_high ?? meta.fiftyTwoWeekHigh ?? null;
  const low52w  = sps.fifty_two_week_low  ?? meta.fiftyTwoWeekLow  ?? null;

  const yfDividend = yfSum.dividendYield?.raw ?? yfSum.dividendYield ?? null;
  const tdDividend = div.forward_annual_dividend_yield != null ? div.forward_annual_dividend_yield : null;
  const dividend   = yfDividend != null ? yfDividend * 100
                   : tdDividend != null ? tdDividend * 100
                   : null;

  const yfEpsGrowth     = yfFin.earningsGrowth?.raw ?? yfFin.earningsGrowth ?? null;
  const yfRevenueGrowth = yfFin.revenueGrowth?.raw  ?? yfFin.revenueGrowth  ?? null;
  const tdEpsGrowth     = inc.quarterly_earnings_growth_yoy ?? null;
  const tdRevenueGrowth = inc.quarterly_revenue_growth      ?? null;
  const epsGrowth     = yfEpsGrowth     != null ? yfEpsGrowth * 100     : tdEpsGrowth     != null ? tdEpsGrowth * 100     : null;
  const revenueGrowth = yfRevenueGrowth != null ? yfRevenueGrowth * 100 : tdRevenueGrowth != null ? tdRevenueGrowth * 100 : null;

  const yfDebtEquity = yfFin.debtToEquity?.raw ?? yfFin.debtToEquity ?? null;
  const tdDebtEquity = bal.total_debt_to_equity_mrq ?? null;
  const debtEquity   = yfDebtEquity != null ? yfDebtEquity / 100
                     : tdDebtEquity != null ? tdDebtEquity / 100
                     : null;

  // New indicators: PEG, Current Ratio, ROE, FCF
  const rawPeg      = yfDef.pegRatio?.raw ?? yfDef.pegRatio ?? null;
  const rawROE      = yfFin.returnOnEquity?.raw ?? yfFin.returnOnEquity ?? null;
  const rawCR       = yfFin.currentRatio?.raw   ?? yfFin.currentRatio   ?? null;
  const rawFCF      = yfFin.freeCashflow?.raw   ?? yfFin.freeCashflow   ?? null;
  // PEG fallback: compute from P/E ÷ EPS growth (%)
  const computedPeg = (pe != null && pe > 0 && epsGrowth != null && epsGrowth > 0)
                    ? pe / epsGrowth : null;
  const peg          = rawPeg    ?? computedPeg ?? null;
  const roe          = rawROE != null ? rawROE * 100 : null;   // store as %
  const currentRatio = rawCR   ?? null;
  const fcf          = rawFCF  ?? null;

  const yfInstPct = yfDef.heldPercentInstitutions?.raw ?? yfDef.heldPercentInstitutions ?? null;
  const tdInstPct = sst.percent_held_by_institutions ?? null;
  const instPct   = yfInstPct ?? tdInstPct ?? finviz?.instOwn ?? null;

  // New fields for 4-family scoring model
  const rawOperatingMargin = yfFin.operatingMargins?.raw ?? yfFin.operatingMargins ?? null;
  const operatingMargin    = rawOperatingMargin != null ? rawOperatingMargin * 100 : null; // store as %

  const rawInsiderPct  = yfDef.heldPercentInsiders?.raw ?? yfDef.heldPercentInsiders ?? null;
  const insiderOwnership = rawInsiderPct != null ? rawInsiderPct * 100 : null; // store as %

  const rawShortFloat = yfDef.shortPercentOfFloat?.raw ?? yfDef.shortPercentOfFloat ?? null;
  const shortFloat    = rawShortFloat != null ? rawShortFloat * 100 : null; // store as %

  const epsSurprise = yfFund?._epsSurprise ?? null;

  const analystMean  = yfFin.recommendationMean?.raw ?? yfFin.recommendationMean ?? null;
  const analystCount = yfFin.numberOfAnalystOpinions?.raw ?? yfFin.numberOfAnalystOpinions ?? null;
  // Use Finnhub/FMP analyst score if Yahoo/TwelveData ratings are unavailable
  const analystScore = aggregateRatings(ratings) ?? yfFund?._finnhubAnalystScore ?? yfFund?._fmpAnalystScore ?? null;

  const yfTargetMean = yfFin.targetMeanPrice?.raw ?? yfFin.targetMeanPrice ?? null;
  const yfTargetHigh = yfFin.targetHighPrice?.raw ?? yfFin.targetHighPrice ?? null;
  const yfTargetLow  = yfFin.targetLowPrice?.raw  ?? yfFin.targetLowPrice  ?? null;
  // TwelveData returns { price_target: 123.4 } — a flat number, not object
  const tdPTVal = typeof target?.price_target === 'number' ? target.price_target : null;
  const targetMean = yfTargetMean ?? tdPTVal ?? finviz?.targetPrice ?? null;
  const targetHigh = yfTargetHigh ?? null;
  const targetLow  = yfTargetLow  ?? null;

  let earningsDate = null;
  const yfEarningsDates = yfCal.earnings?.earningsDate;
  if (Array.isArray(yfEarningsDates) && yfEarningsDates.length > 0) {
    const next = yfEarningsDates.find(d => {
      const ts = typeof d === 'object' ? (d.raw ?? d) : d;
      return new Date(ts * 1000) > new Date();
    });
    if (next != null) {
      const ts = typeof next === 'object' ? (next.raw ?? next) : next;
      earningsDate = new Date(ts * 1000);
    }
  }
  if (!earningsDate) {
    const earningsArr = Array.isArray(earning?.earnings) ? earning.earnings : [];
    const nextEarning = earningsArr.find(e => e.date && new Date(e.date) > new Date());
    if (nextEarning) earningsDate = new Date(nextEarning.date);
  }

  const rawNews   = newsResp?.news || [];
  const newsItems = rawNews.slice(0, 8).map(n => ({
    headline: n.title,
    url:      n.link,
    source:   n.publisher,
    datetime: (n.providerPublishTime || 0) * 1000,
    image:    n.thumbnail?.resolutions?.[0]?.url || null,
  }));

  return {
    symbol, name, sector, industry, description, employees, website, country,
    exchange, currency, isTASE, isCrypto, marketState,
    price, prevClose, change, changePct,
    pe, pb, ps, marketCap, beta, dividend,
    high52w, low52w,
    analystScore, analystMean, analystCount,
    targetMean, targetHigh, targetLow,
    debtEquity, earningsDate,
    instPct, epsGrowth, revenueGrowth,
    peg, roe, currentRatio, fcf,
    operatingMargin, insiderOwnership, shortFloat, epsSurprise,
    newsItems,
  };
}

export async function fetchAllData(symbol, lite = false) {
  const cached = cacheGet(symbol);
  if (cached) return { data: cached, fromCache: true, offline: false };

  const stale = cacheGetStale(symbol);

  try {
    const isCrypto = isCryptoSymbol(symbol);
    const isTASE   = symbol.endsWith('.TA');
    const skipFund = isTASE || isCrypto;

    const chartRaw = await yahooChart(symbol, '1d', '1d');
    const meta = chartRaw?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) throw new Error('no_data');

    // Start news fetch immediately in parallel with fundamentals
    const newsPromise = yahooNewsSearch(symbol).catch(() => null);

    let yfFund = null;
    let stats  = null;
    let ratings = null, target = null, earning = null;

    if (!skipFund) {
      const cached24h = fundGet(symbol);
      if (cached24h) {
        yfFund   = cached24h.yfFund   ?? null;
        stats    = cached24h.stats    ?? null;
        ratings  = cached24h.ratings  ?? null;
        target   = cached24h.target   ?? null;
        earning  = cached24h.earning  ?? null;
      } else {
        yfFund = await yahooFundamentals(symbol);

        // Fallback cascade when Yahoo Finance is unavailable (GDPR/crumb block from IL IPs)
        // 1. Finnhub — covers PE, PB, PS, Beta, Dividend, EPS/Rev growth, Earnings calendar, Analyst rec
        if (!yfFund) {
          yfFund = await fetchFinnhubFundamentals(symbol).catch(() => null);
        }
        // 2. FMP / Alpha Vantage
        if (!yfFund) {
          yfFund = await fetchFMPFundamentals(symbol).catch(() => null)
                ?? await fetchAVFundamentals(symbol).catch(() => null);
        }
        // 3. EDGAR — free SEC data for US stocks, no API key required
        if (!yfFund && !skipFund) {
          const price = meta.regularMarketPrice ?? null;
          yfFund = await fetchEdgarFundamentals(symbol, price).catch(() => null);
        }

        if (!lite) {
          if (!yfFund) {
            stats = await tdStatistics(symbol).catch(() => null);
          }
          // Earnings calendar: Finnhub already embedded in yfFund.calendarEvents when available.
          // TwelveData/AV/EDGAR estimate as further fallbacks.
          const [ratingsRes, targetRes, earningRes] = await Promise.all([
            !yfFund?._finnhubSource ? tdAnalystRatings(symbol).catch(() => null) : Promise.resolve(null),
            tdPriceTarget(symbol).catch(() => null),
            !yfFund?._finnhubSource ? tdEarnings(symbol).catch(() => null) : Promise.resolve(null),
          ]);
          ratings = ratingsRes;
          target  = targetRes;
          // If Finnhub provided earnings in calendarEvents, no need for separate earning fetch
          if (!yfFund?._finnhubSource) {
            const edgarCik = EDGAR_CIK[symbol.toUpperCase()];
            earning = earningRes
              ?? await fetchAvEarnings(symbol).catch(() => null)
              ?? await estimateNextEarningsFromEdgar(edgarCik).catch(() => null);
          }
        } else {
          if (!yfFund) {
            stats = await tdStatistics(symbol).catch(() => null);
          }
        }

        fundSet(symbol, { yfFund, stats, ratings, target, earning });
      }
    }

    const [newsResp, finviz] = await Promise.all([
      newsPromise,
      (!skipFund) ? fetchFinvizData(symbol).catch(() => null) : Promise.resolve(null),
    ]);

    const data = parseAllData({ meta, yfFund, stats, ratings, target, earning, newsResp, finviz }, symbol);
    cacheSet(symbol, data);
    return { data, fromCache: false, offline: false };

  } catch (err) {
    if (stale) {
      return { data: stale.data, fromCache: true, offline: true, cacheDate: new Date(stale.ts) };
    }
    throw err;
  }
}

// ── Technical indicator helpers ────────────────────────

/**
 * Wilder's RSI (period = 14).
 * Requires at least period+1 data points.
 * Returns null when there isn't enough data.
 */
export function calcRSI14(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;

  // Seed: simple average of first `period` gains / losses
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else          avgLoss -= diff;   // store as positive number
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for the remaining bars
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

/**
 * Simple Moving Average of the last `period` values.
 * Returns null when there isn't enough data.
 */
export function calcSMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  const sum   = slice.reduce((a, b) => a + b, 0);
  return parseFloat((sum / period).toFixed(4));
}

/**
 * Calculate 1-year Beta vs SPY from aligned daily price histories.
 * stockHistory / spyHistory are arrays of { time (unix seconds), value }.
 */
export function calcBeta(stockHistory, spyHistory) {
  if (!stockHistory?.length || !spyHistory?.length) return null;

  // Build SPY price map by day-aligned timestamp
  const spyMap = new Map();
  for (const p of spyHistory) {
    const day = Math.floor(p.time / 86400) * 86400;
    spyMap.set(day, p.value);
  }

  // Align by date
  const sArr = [], mArr = [];
  for (const p of stockHistory) {
    const day = Math.floor(p.time / 86400) * 86400;
    const sp  = spyMap.get(day);
    if (sp != null && p.value != null) { sArr.push(p.value); mArr.push(sp); }
  }
  if (sArr.length < 30) return null;

  // Daily returns
  const sRet = [], mRet = [];
  for (let i = 1; i < sArr.length; i++) {
    if (!sArr[i-1] || !mArr[i-1]) continue;
    sRet.push((sArr[i] - sArr[i-1]) / sArr[i-1]);
    mRet.push((mArr[i] - mArr[i-1]) / mArr[i-1]);
  }
  if (sRet.length < 20) return null;

  const n     = sRet.length;
  const sMean = sRet.reduce((a, b) => a + b, 0) / n;
  const mMean = mRet.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varM = 0;
  for (let i = 0; i < n; i++) {
    cov  += (sRet[i] - sMean) * (mRet[i] - mMean);
    varM += (mRet[i] - mMean) ** 2;
  }
  if (!varM) return null;
  return parseFloat((cov / varM).toFixed(2));
}

// ── fetchStockFullData — unified 5-min cached fetch ────
/**
 * Fetches everything needed for a full stock view in ONE call:
 *   - Current quote data (price, fundamentals, news)
 *   - 1-year daily historical prices  (~252 trading days)
 *   - Locally computed RSI(14), MA50, MA200
 *
 * Results are cached in localStorage for 5 minutes so rapid
 * re-renders / page switches don't trigger extra API calls.
 *
 * @returns {{
 *   quote:      Object,       // full parsed quote object
 *   history:    Array,        // [{time, value}] daily for 1Y
 *   indicators: {
 *     rsi14:          number|null,
 *     ma50:           number|null,
 *     ma200:          number|null,
 *     priceAboveMA50:  boolean,
 *     priceAboveMA200: boolean,
 *     goldenCross:     boolean,   // MA50 > MA200
 *   },
 *   fromCache:  boolean,
 *   cacheAgeMs: number,       // ms since cache was written (0 if fresh)
 * }}
 */
export async function fetchStockFullData(symbol) {
  // ── 1. Cache hit? ───────────────────────────────────
  const hit = fullCacheGet(symbol);
  if (hit) {
    return { ...hit.data, fromCache: true, cacheAgeMs: hit.age };
  }

  // ── 2. Fetch quote + 1Y daily history + SPY history in parallel ──
  const isSpy = symbol.toUpperCase() === 'SPY';
  const [quoteResult, history, spyHistory] = await Promise.all([
    fetchAllData(symbol),
    _fetch1YDaily(symbol),
    isSpy ? Promise.resolve([]) : _fetch1YDaily('SPY'),
  ]);

  const quote = quoteResult.data;

  // ── 3. Compute indicators from daily closes ─────────
  const closes = history.map(p => p.value);

  const rsi14          = calcRSI14(closes);
  const ma50           = calcSMA(closes, 50);
  const ma200          = calcSMA(closes, 200);
  const lastPrice      = quote.price ?? (closes[closes.length - 1] ?? null);
  const priceAboveMA50  = (lastPrice != null && ma50  != null) ? lastPrice > ma50  : null;
  const priceAboveMA200 = (lastPrice != null && ma200 != null) ? lastPrice > ma200 : null;
  const goldenCross     = (ma50 != null && ma200 != null) ? ma50 > ma200 : null;
  const beta            = isSpy ? 1 : calcBeta(history, spyHistory);

  const indicators = { rsi14, ma50, ma200, priceAboveMA50, priceAboveMA200, goldenCross, beta };

  const result = { quote, history, indicators, fromCache: false, cacheAgeMs: 0 };

  // ── 4. Persist to 5-min cache ───────────────────────
  fullCacheSet(symbol, result);

  return result;
}

/**
 * Internal: fetch 1-year daily candles (interval=1d).
 * We request ~1.1 years so weekends/holidays don't push
 * us under 200 usable bars for MA200.
 */
async function _fetch1YDaily(symbol) {
  const now     = Math.floor(Date.now() / 1000);
  const period1 = now - Math.ceil(1.1 * 365 * 86400);  // ~400 calendar days
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
            + `?period1=${period1}&period2=${now}&interval=1d&includePrePost=false`;

  try {
    const raw    = await fetchProxy(url);
    const result = raw?.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp || [];
    const closes     = result.indicators?.quote?.[0]?.close || [];
    return timestamps
      .map((t, i) => ({ time: t, value: closes[i] }))
      .filter(p => p.value != null);
  } catch {
    return [];
  }
}

export async function fetchHistory(symbol, range) {
  const now = Math.floor(Date.now() / 1000);
  const configs = {
    '1D': { period1: now - 86400,             interval: '5m'  },
    '1W': { period1: now - 7   * 86400,       interval: '15m' },
    '1M': { period1: now - 30  * 86400,       interval: '1d'  },
    '3M': { period1: now - 90  * 86400,       interval: '1d'  },
    '6M': { period1: now - 180 * 86400,       interval: '1d'  },
    '1Y': { period1: now - 365 * 86400,       interval: '1wk' },
    '3Y': { period1: now - 3 * 365 * 86400,   interval: '1mo' },
    '5Y': { period1: now - 5 * 365 * 86400,   interval: '1mo' },
  };
  const { period1, interval } = configs[range] || configs['1M'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${now}&interval=${interval}&includePrePost=false`;
  const raw = await fetchProxy(url);
  const result = raw?.chart?.result?.[0];
  if (!result) return [];
  const ts    = result.timestamp || [];
  const q     = result.indicators?.quote?.[0] || {};
  const closes = q.close || [];
  const opens  = q.open  || [];
  const highs  = q.high  || [];
  const lows   = q.low   || [];
  return ts
    .map((t, i) => ({
      time:  t,
      value: closes[i],
      open:  opens[i]  ?? closes[i],
      high:  highs[i]  ?? closes[i],
      low:   lows[i]   ?? closes[i],
      close: closes[i],
    }))
    .filter(p => p.value != null);
}

/**
 * Cloudflare Worker — CORS Proxy + Daily S&P 500 Scanner for BullTherapy
 *
 * Endpoints:
 *   GET /?url=...           → CORS proxy (existing)
 *   GET /top-picks          → Returns cached daily scan results from KV
 *   GET /top-picks?run=1&secret=XXX → Trigger manual scan (for testing)
 *
 * Scheduled: runs daily at 03:00 UTC via Cron Trigger
 */

// ── S&P 500 Universe (full ~500 stocks) ──────────────────────────────────────
const SP500_UNIVERSE = [
  // ── Information Technology ─────────────────────────────────────────────────
  // Mega-cap platform
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','ORCL','CRM',
  // Semiconductors & equipment
  'AMD','QCOM','TXN','AMAT','MU','LRCX','KLAC','ADI','SNPS','CDNS',
  'MRVL','MCHP','NXPI','ON','SWKS','MPWR','TER','KEYS','INTC','ANSS',
  // Software
  'ADBE','NOW','INTU','FTNT','PANW','CRWD','NET','DDOG','SNOW','ADSK',
  'WDAY','PAYC','VRSN','GDDY','PTC','CTSH','AKAM','FFIV','GEN','EPAM',
  'FICO','MDB','ZS','HUBS','PLTR','APP','TTD','OKTA',
  // Hardware, services & IT infrastructure
  'IBM','CSCO','HPQ','HPE','DELL','CDW','WDC','STX','NTAP','GLW',
  'APH','TEL','FTV','ZBRA','TRMB','LDOS','IT','JNPR','ACN','MANH',
  // Clean energy / power tech
  'FSLR','ENPH','GNRC',

  // ── Financials ─────────────────────────────────────────────────────────────
  // Banks
  'JPM','BAC','WFC','GS','MS','USB','PNC','TFC','COF','MTB',
  'RF','FITB','HBAN','KEY','CFG','ZION','FHN','CMA',
  // Exchanges, brokers & wealth management
  'BLK','AXP','SCHW','SPGI','MCO','ICE','CME','CBOE','NDAQ','MKTX',
  'STT','BK','NTRS','TROW','IVZ','BEN','VOYA','RJF','FDS','SEIC','BR',
  // Insurance
  'CB','PGR','MMC','MET','PRU','AFL','ALL','HIG','LNC','UNM',
  'CINF','WRB','GL','AIG','AMP','EG','AON','WTW','BRO','ERIE','AIZ',
  // Consumer finance & alternative assets
  'SYF','ALLY','PFG','KKR','APO','CG','FNF','LPLA','ORI',

  // ── Health Care ────────────────────────────────────────────────────────────
  // Pharmaceuticals & biotech
  'LLY','JNJ','ABBV','MRK','AMGN','PFE','BMY','GILD','VRTX','REGN',
  'MRNA','BIIB','ALNY','INCY','NBIX','UTHR','EXAS','OGN',
  // Medical devices & diagnostics
  'UNH','TMO','ABT','DHR','ISRG','SYK','BSX','ZTS','MDT','EW',
  'DXCM','BDX','GEHC','RMD','HOLX','IQV','PODD','RVTY','MTD','A',
  'BAX','TFX','ALGN','WAT','ILMN','COO','CRL','TECH','SOLV',
  // Health services & managed care
  'CI','ELV','HUM','CNC','MOH','CVS','HCA','MCK','ABC','CAH',
  'DGX','LH','HSIC',

  // ── Consumer Discretionary ─────────────────────────────────────────────────
  // General & specialty retail
  'HD','TJX','LOW','TGT','DG','DLTR','ROST','BBY','BURL','DECK',
  'ORLY','AZO','KMX','AN','CPRT','DKS','GPC',
  // Restaurants
  'MCD','SBUX','YUM','CMG','DPZ',
  // Hotels & travel
  'HLT','MAR','BKNG','ABNB','EXPE',
  // Gaming, entertainment & cruises
  'LVS','MGM','CZR','WYNN','RCL','CCL','NCLH','LYV','PENN',
  // Automobiles & components
  'F','GM','APTV','BWA','LKQ','LEA',
  // Homebuilders & home products
  'DHI','LEN','NVR','PHM','TOL','POOL','MAS','WHR','SCI','TPX',
  // Apparel, footwear & accessories
  'NKE','LULU','RL','PVH','TPR','HAS','MAT','GRMN',
  // Online retail & marketplaces
  'UBER','DASH','EBAY','ETSY','RH','WSM',
  // Airlines
  'DAL','UAL','AAL','LUV','ALK',

  // ── Consumer Staples ───────────────────────────────────────────────────────
  'PG','KO','PEP','PM','MO','MDLZ','CL','EL','KMB','GIS',
  'WMT','COST','KR','SYY','ADM','CAG','CPB','HRL','MKC','CHD',
  'CLX','HSY','MNST','STZ','TAP','KHC','SJM','WBA','BG','TSN','LW',

  // ── Industrials ────────────────────────────────────────────────────────────
  // Aerospace & defense
  'RTX','LMT','NOC','GD','LHX','TDG','HWM','HEI','BA','SAIC','TXT',
  // Capital goods & machinery
  'CAT','DE','HON','GE','GEV','EMR','ETN','PH','ROK','ITW',
  'DOV','IR','TT','JCI','CARR','OTIS','ALLE','MMM','WAB','TDY',
  'IEX','NDSN','LII','AOS','PNR','SNA','SWK',
  // Commercial & professional services
  'WM','RSG','VRSK','EFX','TRU','CTAS','PAYX','ADP',
  'FAST','GWW','PWR','WCC','EME','AXON','MTZ','J','ACM',
  // Transportation
  'UPS','FDX','CSX','UNP','NSC','ODFL','XPO','CHRW','EXPD',

  // ── Energy ─────────────────────────────────────────────────────────────────
  'XOM','CVX','COP','EOG','SLB','PSX','VLO','MPC','OXY','HAL',
  'DVN','FANG','BKR','APA','CTRA','EQT','HES','TRGP','OKE','KMI',
  'WMB','DINO','NOV',

  // ── Communication Services ─────────────────────────────────────────────────
  'NFLX','DIS','CMCSA','T','VZ','TMUS','CHTR','EA','WBD','TTWO',
  'OMC','IPG','FOXA','NWS','PARA','MTCH','PINS','NYT',

  // ── Utilities ──────────────────────────────────────────────────────────────
  'NEE','SO','DUK','AEP','SRE','EXC','XEL','D','PCG','EIX',
  'PPL','AES','NRG','CMS','ETR','WEC','ES','CNP','FE','AWK',
  'EVRG','LNT','NI','PNW',

  // ── Real Estate ────────────────────────────────────────────────────────────
  'PLD','AMT','EQIX','CCI','PSA','O','WELL','DLR','SPG','VICI',
  'EXR','AVB','EQR','ESS','MAA','INVH','ARE','BXP','IRM','SBAC',
  'KIM','REG','FRT','VTR','NNN',

  // ── Materials ──────────────────────────────────────────────────────────────
  'LIN','APD','SHW','ECL','NEM','FCX','PPG','VMC','MLM','DD',
  'DOW','LYB','EMN','ALB','IFF','CF','MOS','IP','PKG','AVY',
  'RPM','CE','CTVA','BALL','AMCR','FMC','CCK','HUN','OLN',
];

const ALLOWED_ORIGINS = [
  'https://bulltherapy.com',
  'https://www.bulltherapy.com',
  'https://oranmikell-wq.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const ALLOWED_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'finance.yahoo.com',
  'api.twelvedata.com',
  'generativelanguage.googleapis.com',
  'production.dataviz.cnn.io',
  'api.stlouisfed.org',
  'www.aaii.com',
  'data.sec.gov',
  'www.sec.gov',
  'www.alphavantage.co',
  'finnhub.io',
  'financialmodelingprep.com',
  'finviz.com',
  'markets.cboe.com',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KV_KEY = 'top-picks-v3'; // v3: includes ATH (5Y)

// ── Main export ───────────────────────────────────────────────────────────────
export default {
  // HTTP requests
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url    = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // ── /top-picks endpoint ──────────────────────────────────────────────────
    if (url.pathname === '/top-picks') {
      // Manual trigger for testing: /top-picks?run=1&secret=YOUR_SECRET
      const runSecret = env.SCAN_SECRET || '';
      if (url.searchParams.get('run') === '1' && url.searchParams.get('secret') === runSecret && runSecret) {
        ctx.waitUntil(runDailyScan(env));
        return new Response(JSON.stringify({ status: 'scan started' }), {
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }

      // Return cached results
      try {
        const cached = await env.TOP_PICKS_KV.get(KV_KEY, { type: 'json' });
        if (!cached) {
          return new Response(JSON.stringify({ picks: [], scannedAt: null, message: 'No scan results yet. First scan runs at 03:00 UTC.' }), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(cached), {
          headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Standard CORS proxy ──────────────────────────────────────────────────
    const { searchParams } = url;
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders(origin) });
    }

    let parsedUrl;
    try { parsedUrl = new URL(targetUrl); }
    catch { return new Response('Invalid URL', { status: 400, headers: corsHeaders(origin) }); }

    if (!ALLOWED_HOSTS.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h))) {
      return new Response('Host not allowed', { status: 403, headers: corsHeaders(origin) });
    }

    if (parsedUrl.hostname === 'finance.yahoo.com' && parsedUrl.pathname.startsWith('/quote/')) {
      return handleYahooQuotePage(parsedUrl.toString(), origin);
    }

    if ((parsedUrl.hostname === 'query1.finance.yahoo.com' || parsedUrl.hostname === 'query2.finance.yahoo.com') &&
        parsedUrl.pathname.includes('/quoteSummary/')) {
      return handleYahooFundamentals(parsedUrl, origin);
    }

    if (parsedUrl.hostname === 'www.aaii.com' && parsedUrl.pathname === '/sentimentsurvey') {
      return handleAAIIPage(origin);
    }

    if (parsedUrl.hostname === 'finviz.com' && parsedUrl.pathname === '/quote.ashx') {
      return handleFinvizPage(parsedUrl.toString(), origin);
    }

    try {
      const isSEC = parsedUrl.hostname.endsWith('sec.gov');
      const response = await fetch(new Request(targetUrl, {
        method: request.method,
        headers: {
          'User-Agent': isSEC ? 'BullTherapy/1.0 info@bulltherapy.com' : UA,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      }));

      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => newHeaders.set(k, v));
      newHeaders.delete('content-encoding');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 502,
        headers: corsHeaders(origin),
      });
    }
  },

  // Cron Trigger — runs daily at 03:00 UTC
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyScan(env));
  },
};

// ── Daily S&P 500 Scanner ─────────────────────────────────────────────────────
async function runDailyScan(env) {
  console.log('[Scanner] Starting daily S&P 500 scan...');
  const results = [];
  // Finnhub free plan: 60 req/min = 1 req/sec.
  // With batch=5 stocks running in parallel and 6000ms pause after each batch:
  //   5 Finnhub calls per batch, 1 batch every ~7s → ~43 Finnhub calls/min (safe)
  //   Total scan time: ~99 batches × 7s ≈ 11.5 minutes (within 15-min cron limit)
  const BATCH = 5;
  const BATCH_DELAY = 6000;

  for (let i = 0; i < SP500_UNIVERSE.length; i += BATCH) {
    const batch = SP500_UNIVERSE.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(sym => scoreStock(sym, env)));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    if (i + BATCH < SP500_UNIVERSE.length) await sleep(BATCH_DELAY);
  }

  // Sort by score, take top 20
  results.sort((a, b) => b.score - a.score);
  const top20 = results.slice(0, 20);

  const payload = {
    picks: top20,
    scannedAt: new Date().toISOString(),
    universe: SP500_UNIVERSE.length,
    scored: results.length,
  };

  await env.TOP_PICKS_KV.put(KV_KEY, JSON.stringify(payload), {
    expirationTtl: 60 * 60 * 30, // 30 hours (keeps yesterday's results if scan fails)
  });

  console.log(`[Scanner] Done. Scored ${results.length}/${SP500_UNIVERSE.length} stocks. Top: ${top20[0]?.symbol} (${top20[0]?.score})`);
}

// ── Score a single stock — uses exact scoring.js formula ─────────────────────
async function scoreStock(symbol, env) {
  try {
    const [chart, metrics] = await Promise.all([
      fetchChart(symbol),
      fetchFinnhubMetrics(symbol, env.FINNHUB_KEY),
    ]);

    const m          = metrics?.metric || {};
    const hasChart   = chart && chart.closes.length >= 10;
    const hasFinnhub = metrics != null;
    if (!hasChart && !hasFinnhub) return null;

    // ── Raw fields ────────────────────────────────────────────────
    const price      = chart?.price     ?? null;
    const name       = chart?.name      ?? symbol;
    const changePct  = chart?.changePct ?? null;
    const high52w    = chart?.high52    ?? null;
    const low52w     = chart?.low52     ?? null;
    const marketCapM = m.marketCapitalization ?? null;          // millions USD
    const marketCap  = marketCapM != null ? marketCapM * 1e6 : null; // full USD

    // ── Compute MA200 and RSI from Yahoo closes ───────────────────
    const closes   = chart?.closes ?? [];
    let ma200      = null;
    let aboveMA200 = null;
    if (closes.length >= 50 && price != null) {
      ma200 = calcSMA(closes, Math.min(200, closes.length));
      if (ma200 != null) aboveMA200 = price >= ma200;
    }
    const rsi = closes.length >= 15 ? calcRSI(closes) : null;

    // ── Sector key (default — no profile API call to stay within rate limits)
    const sectorKey = 'default';

    // ── Growth family (35%) — scoring.js GROWTH_WEIGHTS ──────────
    // Finnhub: epsGrowthTTMYoy and revenueGrowthTTMYoy are already in %
    const familyGrowth = wAvg([
      { score: scoreEPSSurprise(null),                   weight: GROWTH_WEIGHTS.epsSurprise }, // not available
      { score: scoreEPS(m.epsGrowthTTMYoy ?? null),      weight: GROWTH_WEIGHTS.eps         },
      { score: scoreRevenue(m.revenueGrowthTTMYoy ?? null), weight: GROWTH_WEIGHTS.revenue  },
    ]);

    // ── Valuation family (25%) — scoring.js VALUATION_WEIGHTS ────
    const familyValuation = wAvg([
      { score: scorePEG(m.pegNormalizedAnnual ?? null),  weight: VALUATION_WEIGHTS.peg },
      { score: scoreFCF(null, null),                     weight: VALUATION_WEIGHTS.fcf }, // not available
      { score: scorePEonly(m.peTTM ?? null, sectorKey),  weight: VALUATION_WEIGHTS.pe  },
    ]);

    // ── Quality family (20%) — scoring.js QUALITY_WEIGHTS ────────
    // Finnhub operatingMarginTTM and roeTTM are already in % (e.g. 25.3 = 25.3%)
    const familyQuality = wAvg([
      { score: scoreOperatingMargin(m.operatingMarginTTM ?? null, sectorKey), weight: QUALITY_WEIGHTS.operatingMargin  },
      { score: scoreInsiderOwnership(null),                                   weight: QUALITY_WEIGHTS.insiderOwnership }, // not available
      { score: scoreROE(m.roeTTM ?? null),                                   weight: QUALITY_WEIGHTS.roe              },
      { score: scoreCurrentRatio(m.currentRatioAnnual ?? null),              weight: QUALITY_WEIGHTS.currentRatio     },
    ]);

    // ── Technical family (20%) — scoring.js TECHNICAL_WEIGHTS ────
    const familyTechnical = wAvg([
      { score: scoreMA200Position(price, ma200),   weight: TECHNICAL_WEIGHTS.ma200        },
      { score: scoreDistFromHigh(price, high52w),  weight: TECHNICAL_WEIGHTS.distFromHigh },
      { score: scoreShortFloat(null),              weight: TECHNICAL_WEIGHTS.shortFloat   }, // not available
      { score: scoreRSI(rsi),                      weight: TECHNICAL_WEIGHTS.rsi          },
    ]);

    // ── Final weighted score — identical to scoring.js calcScore ─
    let totalWeight = 0, weightedSum = 0;
    const fw = FAMILY_WEIGHTS;
    if (familyGrowth    != null) { weightedSum += familyGrowth    * fw.growth;    totalWeight += fw.growth;    }
    if (familyValuation != null) { weightedSum += familyValuation * fw.valuation; totalWeight += fw.valuation; }
    if (familyQuality   != null) { weightedSum += familyQuality   * fw.quality;   totalWeight += fw.quality;   }
    if (familyTechnical != null) { weightedSum += familyTechnical * fw.technical; totalWeight += fw.technical; }

    if (totalWeight === 0) return null;

    const score  = Math.round(weightedSum / totalWeight);
    const rating = score >= 66 ? 'buy' : score >= 41 ? 'wait' : 'sell';

    return {
      symbol, name, score, rating,
      price, changePct,
      high52: high52w,
      ath: chart?.ath ?? null,
      marketCap: marketCapM,
      aboveMA200,
    };

  } catch (e) {
    console.warn(`[Scanner] ${symbol}: ${e.message}`);
    return null;
  }
}

// ── Fetch Finnhub fundamental metrics ────────────────────────────────────────
async function fetchFinnhubMetrics(symbol, key) {
  if (!key) return null;
  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Fetch Yahoo Finance chart (close prices + meta) ───────────────────────────
// Uses 5Y weekly: gives enough data for ATH, MA200 (weekly), and RSI.
// high52 / low52 still come from Yahoo meta (always accurate).
async function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1wk&includePrePost=false`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta   = result.meta || {};
    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(v => v != null);
    const price   = meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : null);
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
    const changePct = price != null && prevClose != null && prevClose !== 0
      ? ((price - prevClose) / prevClose) * 100
      : null;
    // ATH = max close over 5 years
    const ath = closes.length ? Math.max(...closes) : null;
    return {
      closes,
      price,
      name:     meta.longName ?? meta.shortName ?? symbol,
      changePct,
      high52:   meta.fiftyTwoWeekHigh ?? null,
      low52:    meta.fiftyTwoWeekLow  ?? null,
      ath,
    };
  } catch { return null; }
}

// ── Scoring engine — exact mirror of scoring.js ───────────────────────────────
// Family weights (identical to scoring.js)
const FAMILY_WEIGHTS    = { growth: 0.35, valuation: 0.25, quality: 0.20, technical: 0.20 };
const GROWTH_WEIGHTS    = { epsSurprise: 0.50, eps: 0.30, revenue: 0.20 };
const VALUATION_WEIGHTS = { peg: 0.50, fcf: 0.30, pe: 0.20 };
const QUALITY_WEIGHTS   = { operatingMargin: 0.35, insiderOwnership: 0.25, roe: 0.25, currentRatio: 0.15 };
const TECHNICAL_WEIGHTS = { ma200: 0.40, distFromHigh: 0.25, shortFloat: 0.20, rsi: 0.15 };

const SECTOR_PE = {
  technology: [15,25,40,60], financials: [8,12,18,25], energy: [8,12,18,25],
  healthcare: [12,20,30,45], real_estate: [15,25,40,60], consumer: [12,18,28,40],
  industrials: [12,18,25,35], communication: [12,20,35,55], utilities: [14,18,25,35],
  materials: [10,15,22,30], default: [12,20,35,55],
};

function getSectorKey(sector) {
  if (!sector) return 'default';
  const s = sector.toLowerCase();
  if (s.includes('tech'))                       return 'technology';
  if (s.includes('financ') || s.includes('bank')) return 'financials';
  if (s.includes('energy'))                     return 'energy';
  if (s.includes('health'))                     return 'healthcare';
  if (s.includes('real estate'))                return 'real_estate';
  if (s.includes('consumer'))                   return 'consumer';
  if (s.includes('industri'))                   return 'industrials';
  if (s.includes('commun'))                     return 'communication';
  if (s.includes('utilit'))                     return 'utilities';
  if (s.includes('material'))                   return 'materials';
  return 'default';
}

function normalizeInverse(value, benchmarks) {
  const [ex, gd, av, po] = benchmarks;
  if (value <= ex) return 100;
  if (value <= gd) return 75 + ((gd - value) / (gd - ex)) * 25;
  if (value <= av) return 40 + ((av - value) / (av - gd)) * 35;
  if (value <= po) return 10 + ((po - value) / (po - av)) * 30;
  return 5;
}

function normalizeLinear(value, min, max) {
  if (value >= max) return 100;
  if (value <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

// Weighted average — skips null scores and re-normalises remaining weights
function wAvg(items) {
  let totalW = 0, sum = 0;
  for (const { score, weight } of items) {
    if (score != null) { sum += score * weight; totalW += weight; }
  }
  return totalW > 0 ? sum / totalW : null;
}

// Individual scorers — exact copies from scoring.js
function scoreEPS(v)        { return v == null ? null : normalizeLinear(v, -30, 40); }
function scoreRevenue(v)    { return v == null ? null : normalizeLinear(v, -10, 30); }
function scoreEPSSurprise(v){ return v == null ? null : normalizeLinear(v, -20, 20); }

function scorePEG(peg) {
  if (peg == null || peg <= 0) return null;
  if (peg <= 0.5) return 100;
  if (peg <= 1.0) return normalizeLinear(1.0 - peg, 0, 0.5) / 100 * 20 + 80;
  if (peg <= 2.0) return normalizeLinear(2.0 - peg, 0, 1.0) / 100 * 40 + 40;
  if (peg <= 4.0) return normalizeLinear(4.0 - peg, 0, 2.0) / 100 * 35 + 5;
  return 5;
}

function scoreFCF(fcf, mc) {
  if (fcf == null) return null;
  if (fcf <= 0) return 10;
  if (mc == null || mc <= 0) return 50;
  return normalizeLinear((fcf / mc) * 100, 0, 10);
}

function scorePEonly(pe, sk) {
  if (pe == null || pe <= 0) return null;
  return normalizeInverse(pe, SECTOR_PE[sk] || SECTOR_PE.default);
}

function scoreOperatingMargin(om, sk) {
  if (om == null) return null;
  const hi = ['technology','healthcare','communication'];
  const ex = hi.includes(sk) ? 30 : 20;
  const gd = hi.includes(sk) ? 20 : 12;
  const av = hi.includes(sk) ? 10 :  5;
  if (om <= 0) return 5;
  if (om >= ex) return 100;
  if (om >= gd) return 70 + ((om - gd) / (ex - gd)) * 30;
  if (om >= av) return 40 + ((om - av) / (gd - av)) * 30;
  return 5 + (om / av) * 35;
}

function scoreInsiderOwnership(pct) {
  if (pct == null) return null;
  if (pct < 0.5) return 20; if (pct <= 5) return 55;
  if (pct <= 15) return 75; if (pct <= 30) return 85;
  if (pct <= 50) return 70; return 40;
}

function scoreROE(roe) {
  if (roe == null) return null;
  if (roe < 0) return 5;
  return normalizeLinear(roe, 0, 30);
}

function scoreCurrentRatio(cr) {
  if (cr == null) return null;
  if (cr >= 2.5) return 100; if (cr >= 2.0) return 85;
  if (cr >= 1.5) return 70;  if (cr >= 1.0) return 45;
  if (cr >= 0.5) return 20;  return 5;
}

function scoreMA200Position(price, ma200) {
  if (price == null || ma200 == null || ma200 === 0) return null;
  const pct = (price / ma200 - 1) * 100;
  if (pct >= 20) return 90; if (pct >= 10) return 80;
  if (pct >= 5)  return 70; if (pct >= 0)  return 60;
  if (pct >= -5) return 40; if (pct >= -10) return 25;
  if (pct >= -20) return 15; return 5;
}

function scoreDistFromHigh(price, high52w) {
  if (price == null || high52w == null || high52w === 0) return null;
  return normalizeInverse(((high52w - price) / high52w) * 100, [0, 10, 30, 50]);
}

function scoreShortFloat(pct) {
  if (pct == null) return null;
  if (pct <= 2) return 95; if (pct <= 5)  return 80;
  if (pct <= 10) return 60; if (pct <= 15) return 40;
  if (pct <= 25) return 20; return 5;
}

function scoreRSI(rsi) {
  if (rsi == null) return null;
  if (rsi < 30) return 70; if (rsi < 50) return 80;
  if (rsi < 65) return 65; if (rsi < 75) return 35;
  return 15;
}

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Yahoo Finance auth helpers ────────────────────────────────────────────────
async function getYahooCrumb() {
  const hdr     = { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9' };
  const htmlHdr = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };

  try {
    const r = await fetch('https://query1.finance.yahoo.com/v1/test/csrfToken', { headers: hdr });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      const cr = j?.csrfToken ?? j?.crumb ?? null;
      if (cr) {
        const rc = r.headers.getSetCookie?.() ?? [];
        return { cookieStr: rc.map(c => c.split(';')[0]).join('; '), crumb: cr };
      }
    }
  } catch {}

  try {
    const pageRes    = await fetch('https://finance.yahoo.com/', { headers: htmlHdr, redirect: 'follow' });
    const pageHtml   = await pageRes.text();
    const pageCookies = pageRes.headers.getSetCookie?.() ?? [];
    let cookieStr    = pageCookies.map(c => c.split(';')[0]).join('; ');

    if (isConsentPage(pageHtml)) {
      const accepted = await acceptYahooConsent(pageHtml, pageCookies);
      if (accepted) cookieStr = accepted;
    }

    if (cookieStr) {
      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/csrfToken', {
        headers: { ...hdr, 'Cookie': cookieStr },
      });
      if (crumbRes.ok) {
        const j  = await crumbRes.json().catch(() => null);
        const cr = j?.csrfToken ?? j?.crumb ?? null;
        if (cr) {
          const moreCookies = crumbRes.headers.getSetCookie?.() ?? [];
          return { cookieStr: [...pageCookies, ...moreCookies].map(c => c.split(';')[0]).join('; '), crumb: cr };
        }
      }
    }
  } catch {}

  return null;
}

async function acceptYahooConsent(html, cookiesList) {
  const get = (name) => {
    const m = html.match(new RegExp(`name=["']${name}["'][^>]*value=["']([^"']+)["']`)) ||
              html.match(new RegExp(`value=["']([^"']+)["'][^>]*name=["']${name}["']`));
    return m?.[1] ?? null;
  };
  const sessionId = get('sessionId');
  if (!sessionId) return null;
  const csrfToken = get('csrfToken') ?? get('gcrumb') ?? '';
  const brandType = get('brandType') ?? 'nonEu';
  const locale    = get('locale')    ?? 'en-US';
  const cookieStr = cookiesList.map(c => c.split(';')[0]).join('; ');
  try {
    const res = await fetch('https://guce.yahoo.com/tcf/v2/accept', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://guce.yahoo.com/',
        ...(cookieStr ? { 'Cookie': cookieStr } : {}),
      },
      body: new URLSearchParams({ brandType, locale, sessionId, csrfToken }).toString(),
      redirect: 'follow',
    });
    const newCookies = res.headers.getSetCookie?.() ?? [];
    return [...cookiesList, ...newCookies].map(c => c.split(';')[0]).join('; ');
  } catch { return null; }
}

function isConsentPage(html) {
  return !html.includes('quoteSummary') && !html.includes('data-sveltekit-fetched') &&
    (html.includes('guce') || html.includes('consent') || html.includes('privacy') ||
     html.includes('\u05E4\u05E8\u05D8\u05D9\u05D5\u05EA'));
}

// ── Yahoo Finance special handlers (unchanged from original) ─────────────────
async function handleYahooFundamentals(parsedUrl, origin) {
  const hdrs = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  const err  = (msg) =>
    new Response(JSON.stringify({ quoteSummary: { result: null, error: { code: 'WorkerError', description: msg } } }),
                 { status: 502, headers: hdrs });
  try {
    const auth = await getYahooCrumb();
    const sep  = parsedUrl.search ? '&' : '?';
    const url  = auth?.crumb
      ? `${parsedUrl.toString()}${sep}crumb=${encodeURIComponent(auth.crumb)}`
      : parsedUrl.toString();

    const fundRes = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(auth?.cookieStr ? { 'Cookie': auth.cookieStr } : {}),
      },
    });

    if (!fundRes.ok) return err(`HTTP ${fundRes.status}`);
    const json = await fundRes.json();
    return new Response(JSON.stringify(json), { status: 200, headers: hdrs });
  } catch (e) {
    return err(e.message);
  }
}

async function handleYahooQuotePage(url, origin) {
  const hdrs = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  const err  = (msg, status = 502) =>
    new Response(JSON.stringify({ quoteSummary: { result: null, error: { code: 'WorkerError', description: msg } } }),
                 { status, headers: hdrs });

  const fetchPage = async (pageUrl, extraCookies = '') => {
    return fetch(pageUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
        'Cache-Control': 'no-cache',
        ...(extraCookies ? { 'Cookie': extraCookies } : {}),
      },
    });
  };

  try {
    let res = await fetchPage(url);
    if (!res.ok) return err(`HTTP ${res.status}`, res.status);
    let html = await res.text();

    if (isConsentPage(html)) {
      const initialCookies = res.headers.getSetCookie?.() ?? [];
      const consentCookieStr = await acceptYahooConsent(html, initialCookies).catch(() => null);
      if (consentCookieStr) {
        res = await fetchPage(url, consentCookieStr);
        if (res.ok) html = await res.text();
      }
      if (isConsentPage(html)) {
        const auth = await getYahooCrumb();
        const sep  = url.includes('?') ? '&' : '?';
        res  = await fetchPage(`${url}${sep}guccounter=1`, auth?.cookieStr ?? '');
        if (res.ok) html = await res.text();
      }
    }

    const m1 = html.match(/<script\s+type="application\/json"\s+data-sveltekit-fetched[^>]*data-url="[^"]*quoteSummary[^"]*"[^>]*>([\s\S]*?)<\/script>/);
    if (m1) {
      try {
        const outer = JSON.parse(m1[1]);
        const inner = JSON.parse(outer.body);
        if (inner?.quoteSummary?.result?.[0]) return new Response(JSON.stringify(inner), { status: 200, headers: hdrs });
      } catch {}
    }

    for (const m of html.matchAll(/<script\s+type="application\/json"\s+data-sveltekit-fetched[^>]*>([\s\S]*?)<\/script>/g)) {
      try {
        const outer = JSON.parse(m[1]);
        const inner = typeof outer.body === 'string' ? JSON.parse(outer.body) : outer;
        if (inner?.quoteSummary?.result?.[0]) return new Response(JSON.stringify(inner), { status: 200, headers: hdrs });
      } catch {}
    }

    const nextM = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextM) {
      try {
        const nd = JSON.parse(nextM[1]);
        const found = findDeep(nd, 'quoteSummary');
        if (found?.result?.[0]) return new Response(JSON.stringify({ quoteSummary: found }), { status: 200, headers: hdrs });
      } catch {}
    }

    const symbol = new URL(url).pathname.split('/').filter(Boolean)[1];
    if (symbol) {
      const auth = await getYahooCrumb();
      const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents';
      for (const host of ['query1', 'query2']) {
        try {
          const sep    = auth?.crumb ? '&' : '?';
          const v10Url = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&formatted=false&corsDomain=finance.yahoo.com${auth?.crumb ? `${sep}crumb=${encodeURIComponent(auth.crumb)}` : ''}`;
          const fundRes = await fetch(v10Url, {
            headers: {
              'User-Agent': UA,
              'Accept': 'application/json',
              'Accept-Language': 'en-US,en;q=0.9',
              ...(auth?.cookieStr ? { 'Cookie': auth.cookieStr } : {}),
            },
          });
          if (fundRes.ok) {
            const json = await fundRes.json();
            if (json?.quoteSummary?.result?.[0]) return new Response(JSON.stringify(json), { status: 200, headers: hdrs });
          }
        } catch {}
      }
    }

    return err('quoteSummary not found');
  } catch (e) {
    return err(e.message);
  }
}

async function handleFinvizPage(url, origin) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finviz.com/',
      },
    });
    if (!res.ok) return new Response(JSON.stringify({}), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    const html = await res.text();
    const data = {};
    for (const [, label, value] of html.matchAll(
      /<td[^>]*class="[^"]*snapshot-td2-cp[^"]*"[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*class="[^"]*snapshot-td2[^"]*"[^>]*><b>\s*([^<]*?)\s*<\/b>/g
    )) { data[label.trim()] = value.trim(); }

    const pct = (s) => (s && s !== '-') ? parseFloat(s) / 100 : null;
    const num = (s) => (s && s !== '-') ? parseFloat(s)       : null;

    return new Response(JSON.stringify({
      instOwn:     pct(data['Inst Own']),
      insiderOwn:  pct(data['Insider Own']),
      targetPrice: num(data['Target Price']),
    }), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({}), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
  }
}

async function handleAAIIPage(origin) {
  const hdrs = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  const err  = (msg) => new Response(JSON.stringify({ error: msg }), { status: 502, headers: hdrs });
  try {
    const res = await fetch('https://www.aaii.com/sentimentsurvey', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) return err(`HTTP ${res.status}`);
    return new Response(JSON.stringify(parseAAII(await res.text())), { status: 200, headers: hdrs });
  } catch (e) {
    return err(e.message);
  }
}

function parseAAII(html) {
  const result = { weekly: [], averages: null, highs: {} };
  const sections = html.split('<div class="datebars">').slice(1);
  for (const sec of sections) {
    const dateM = sec.match(/<div class="date">\s*([\s\S]*?)\s*<\/div>/);
    if (!dateM) continue;
    const label = dateM[1].trim().replace(/\s+/g, ' ').replace(/:$/, '');
    const bullM = sec.match(/class="bar bullish"[^>]*>\s*([\d.]+)%/);
    const neuM  = sec.match(/class="bar neutral"[^>]*>\s*([\d.]+)%/);
    const bearM = sec.match(/class="bar bearish"[^>]*>\s*([\d.]+)%/);
    const endM  = sec.match(/class="ending">Week Ending ([^<]+)<\/div>/);
    const bull = bullM ? +bullM[1] : null;
    const neu  = neuM  ? +neuM[1]  : null;
    const bear = bearM ? +bearM[1] : null;
    const date = endM  ? endM[1].trim() : '';
    if (label === 'Historical Averages') { result.averages = { bull, neu, bear }; }
    else if (label.includes('1-Year Bullish High')) { result.highs.bull = { val: bull, date }; }
    else if (label.includes('1-Year Neutral High')) { result.highs.neu  = { val: neu,  date }; }
    else if (label.includes('1-Year Bearish High')) { result.highs.bear = { val: bear, date }; }
    else if (/\d+\/\d+\/\d+/.test(label) && bull !== null) { result.weekly.push({ date: label, bull, neu, bear }); }
  }
  return result;
}

function findDeep(obj, key, depth = 0) {
  if (depth > 8 || obj === null || typeof obj !== 'object') return null;
  if (key in obj && obj[key] !== null) return obj[key];
  for (const v of Object.values(obj)) {
    const r = findDeep(v, key, depth + 1);
    if (r !== null) return r;
  }
  return null;
}

function corsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.includes(origin)
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

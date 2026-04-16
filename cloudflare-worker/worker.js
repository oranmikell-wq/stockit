/**
 * Cloudflare Worker — CORS Proxy + Daily S&P 500 Scanner for BullTherapy
 *
 * Endpoints:
 *   GET /?url=...           → CORS proxy (existing)
 *   GET /top-picks          → Returns cached daily scan results from KV
 *   GET /top-picks?run=1&secret=XXX → Trigger manual scan (for testing)
 *
 * Scheduled: runs 4x per day at 03:00, 09:00, 15:00, 21:00 UTC via Cron Trigger
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
  'RF','FITB','HBAN','KEY','CFG','ZION','FHN',
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
const KV_KEY          = 'top-picks-v9';      // v9: full fundamentals + criteria scores
const KV_SCORES_KEY   = 'all-scores-v4';     // v4: state embedded inside (no separate scan-state key)
const KV_UNIVERSE_KEY = 'sp500-universe-v1'; // live S&P 500 list from FMP

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
      // Manual trigger: /top-picks?run=1&secret=YOUR_SECRET
      const runSecret = env.SCAN_SECRET || '';
      if (url.searchParams.get('run') === '1' && url.searchParams.get('secret') === runSecret && runSecret) {
        // Reset state and run first chunk immediately
        ctx.waitUntil((async () => {
          // Reset offset to 0 — embed into all-scores so next cron starts fresh
          const currentScores = (await env.TOP_PICKS_KV.get(KV_SCORES_KEY, { type: 'json' })) ?? {};
          currentScores._state = { offset: 0 };
          await env.TOP_PICKS_KV.put(KV_SCORES_KEY, JSON.stringify(currentScores), { expirationTtl: 60 * 60 * 72 });
          await runRollingScan(env);
        })());
        return new Response(JSON.stringify({ status: 'rolling scan reset — fresh FMP universe on next run' }), {
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

    // ── /score?symbol=AAPL endpoint ─────────────────────────────────────────
    if (url.pathname === '/score') {
      const sym = (url.searchParams.get('symbol') || '').toUpperCase();
      if (!sym) {
        return new Response(JSON.stringify({ error: 'Missing symbol' }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }
      try {
        // Always compute fresh (non-scan mode) — ensures full insider/EDGAR data
        const computed = await scoreStock(sym, env);
        if (!computed) {
          return new Response(JSON.stringify({ notFound: true }), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
          });
        }
        const result = { ...computed, scannedAt: new Date().toISOString() };
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }
    }

    // ── /popular — top 10 by daily volume from all-scores ───────────────────
    if (url.pathname === '/popular') {
      try {
        const allScores = await env.TOP_PICKS_KV.get(KV_SCORES_KEY, { type: 'json' }) ?? {};
        const entries = Object.values(allScores).filter(r => r.volume != null && r.price != null);
        entries.sort((a, b) => b.volume - a.volume);
        const picks = entries.slice(0, 10);
        return new Response(JSON.stringify({ picks, scannedAt: picks[0]?.scannedAt ?? null }), {
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }
    }

    // ── /scores?symbols=AAPL,MSFT,TSLA batch endpoint ───────────────────────
    if (url.pathname === '/scores') {
      const raw = url.searchParams.get('symbols') || '';
      const syms = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 50);
      if (!syms.length) {
        return new Response(JSON.stringify({ error: 'Missing symbols' }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }
      try {
        const allScores = await env.TOP_PICKS_KV.get(KV_SCORES_KEY, { type: 'json' }) ?? {};
        const result = {};
        const missing = [];
        for (const sym of syms) {
          if (allScores[sym]) result[sym] = allScores[sym];
          else missing.push(sym);
        }
        // Score missing symbols on-demand (in parallel, max 10)
        if (missing.length) {
          const toScore = missing.slice(0, 10);
          const settled = await Promise.allSettled(toScore.map(sym => scoreStock(sym, env)));
          const newEntries = {};
          settled.forEach((r, i) => {
            if (r.status === 'fulfilled' && r.value) {
              const entry = { ...r.value, scannedAt: new Date().toISOString() };
              result[toScore[i]] = entry;
              newEntries[toScore[i]] = entry;
            }
          });
          // Persist new entries to KV in background
          if (Object.keys(newEntries).length) {
            ctx.waitUntil((async () => {
              try {
                const scores = (await env.TOP_PICKS_KV.get(KV_SCORES_KEY, { type: 'json' })) ?? {};
                Object.assign(scores, newEntries);
                await env.TOP_PICKS_KV.put(KV_SCORES_KEY, JSON.stringify(scores), { expirationTtl: 60 * 60 * 72 });
              } catch {}
            })());
          }
        }
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
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

  // Cron Trigger — runs every minute. ~50 runs × 10 stocks = 500 stocks in ~50 minutes.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runRollingScan(env));
  },
};

// ── Fetch live S&P 500 universe from iShares IVV ETF holdings (daily, free) ──
// Source: BlackRock iShares Core S&P 500 ETF — the definitive, free, daily list.
async function fetchSP500Universe() {
  try {
    const url = 'https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/1467271812596.ajax?fileType=csv&fileName=IVV_holdings&dataType=fund';
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const csv = await res.text();
    const lines = csv.split('\n');
    // Find header row (contains "Ticker")
    const headerIdx = lines.findIndex(l => l.startsWith('"Ticker"') || l.startsWith('Ticker'));
    if (headerIdx < 0) return null;
    const symbols = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const sym = cols[0]?.replace(/"/g, '').trim();
      const assetClass = cols[3]?.replace(/"/g, '').trim();
      // Only include equity holdings with valid tickers
      if (sym && assetClass === 'Equity' && /^[A-Z]{1,5}$/.test(sym)) {
        symbols.push(sym);
      }
    }
    return symbols.length >= 400 ? symbols : null;
  } catch { return null; }
}

// ── Rolling scan ─────────────────────────────────────────────────────────────
// Each cron run: load offset → score 10 stocks → save → advance offset.
// Universe fetched live from FMP at start of each cycle, cached in KV.
// Fallback: static SP500_UNIVERSE if FMP unavailable.
const SCAN_PER_RUN = 10;

async function runRollingScan(env) {
  const TTL = 60 * 60 * 72;

  // ── Read state and scores from a single KV key (_state embedded) ──────────
  const stored = (await env.TOP_PICKS_KV.get(KV_SCORES_KEY, { type: 'json' })) ?? {};
  let offset = typeof stored._state?.offset === 'number' ? stored._state.offset : 0;

  let universe;
  let allScores;

  if (offset === 0) {
    // ── New cycle: fetch live universe, start with CLEAN scores in memory ──
    const fresh = await fetchSP500Universe();
    if (fresh && fresh.length >= 100) {
      universe = fresh;
      await env.TOP_PICKS_KV.put(KV_UNIVERSE_KEY, JSON.stringify(universe), { expirationTtl: TTL });
      console.log(`[Scanner] New cycle. Universe: ${universe.length} stocks from iShares.`);
    } else {
      universe = SP500_UNIVERSE;
      console.log(`[Scanner] iShares unavailable — fallback to static list (${universe.length} stocks).`);
    }
    allScores = {}; // clean slate — _state will be written below after first chunk
  } else {
    universe  = (await env.TOP_PICKS_KV.get(KV_UNIVERSE_KEY, { type: 'json' })) ?? SP500_UNIVERSE;
    // Exclude _state from stock scores
    const { _state: _, ...stockScores } = stored;
    allScores = stockScores;
  }

  const chunk = universe.slice(offset, offset + SCAN_PER_RUN);

  // ── Edge case: offset past end of universe ─────────────────────────────────
  if (!chunk.length) {
    const allResults = Object.values(allScores).filter(r => r.score != null);
    if (allResults.length > 0) {
      allResults.sort((a, b) => b.score - a.score);
      const now = new Date().toISOString();
      await env.TOP_PICKS_KV.put(KV_KEY, JSON.stringify({
        picks: allResults.slice(0, 20), scannedAt: now,
        universe: universe.length, scored: allResults.length,
      }), { expirationTtl: TTL });
      console.log(`[Scanner] Edge reset — wrote top picks from ${allResults.length} scores.`);
    }
    // Reset: write empty scores with state offset=0 (single write)
    await env.TOP_PICKS_KV.put(KV_SCORES_KEY, JSON.stringify({ _state: { offset: 0 } }), { expirationTtl: TTL });
    return;
  }

  const now = new Date().toISOString();
  for (const sym of chunk) {
    try {
      const result = await scoreStock(sym, env, { scanMode: true });
      if (result) allScores[sym] = { ...result, scannedAt: now };
    } catch {}
  }

  const nextOffset = offset + chunk.length;

  if (nextOffset >= universe.length) {
    // ── Cycle complete — publish top picks, reset state ───────────────────
    const allResults = Object.values(allScores).filter(r => r.score != null);
    allResults.sort((a, b) => b.score - a.score);
    // Single write: scores with state reset to 0
    await env.TOP_PICKS_KV.put(KV_SCORES_KEY, JSON.stringify({ _state: { offset: 0 }, ...allScores }), { expirationTtl: TTL });
    await env.TOP_PICKS_KV.put(KV_KEY, JSON.stringify({
      picks: allResults.slice(0, 20), scannedAt: now,
      universe: universe.length, scored: allResults.length,
    }), { expirationTtl: TTL });
    console.log(`[Scanner] Cycle complete. Scored ${allResults.length}/${universe.length}.`);
  } else {
    // Single write: scores + updated offset
    await env.TOP_PICKS_KV.put(KV_SCORES_KEY, JSON.stringify({ _state: { offset: nextOffset }, ...allScores }), { expirationTtl: TTL });
    console.log(`[Scanner] offset ${offset}→${nextOffset} / ${universe.length}.`);
  }
}

// ── Score a single stock — uses exact scoring.js formula ─────────────────────
async function scoreStock(symbol, env, { scanMode = false } = {}) {
  try {
    const basePromises = [
      fetchChart(symbol),
      fetchFinnhubMetrics(symbol, env.FINNHUB_KEY),
      fetchFinnhubEarnings(symbol, env.FINNHUB_KEY),
      fetchFinnhubProfile(symbol, env.FINNHUB_KEY),
    ];
    if (!scanMode) {
      basePromises.push(fetchInsiderTransactions(symbol));
      basePromises.push(fetchFMPKeyMetrics(symbol, env.FMP_KEY));
    }
    const baseResults = await Promise.all(basePromises);
    const [chart, metrics, earningsArr, profile] = baseResults;
    const insiderTxn  = scanMode ? null : (baseResults[4] ?? null);
    const fmpMetrics  = scanMode ? null : (baseResults[5] ?? null);

    // Fetch EDGAR after chart so we have price (skip in scan mode — too slow)
    const edgarPrice = chart?.price ?? null;
    const edgar = scanMode ? null : await fetchEdgarFundamentals(symbol, edgarPrice);

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

    // ── EPS Surprise (from most recent quarterly earnings) ────────
    const latestEarning = earningsArr?.[0];
    let epsSurprise = null;
    if (latestEarning?.actual != null && latestEarning?.estimate != null && latestEarning.estimate !== 0) {
      epsSurprise = ((latestEarning.actual - latestEarning.estimate) / Math.abs(latestEarning.estimate)) * 100;
    }

    // ── FCF from pfcfShareTTM (already in metrics — no extra call needed) ─
    // pfcfShareTTM = Price / FCF-per-share  →  FCF-total = MarketCap / pfcfShareTTM
    const pfcf = m.pfcfShareTTM ?? null;
    const syntheticFCF = (pfcf != null && pfcf > 0 && marketCap != null) ? marketCap / pfcf : null;

    // ── Short Float % — Finnhub shortRatioTTM as rough proxy ────────────────
    let shortFloat = null;
    if (m.shortRatioTTM != null && m.shortRatioTTM > 0) {
      shortFloat = Math.min(m.shortRatioTTM * 2, 30);
    }

    // ── Insider Ownership % — Finnhub fallback ────────────────────────────────
    const insiderOwnership = m.insiderOwnershipPercentage ?? null;

    // ── Compute MA200 and RSI from Yahoo 5Y weekly closes ────────
    // 200 trading days ÷ 5 days/week = 40 weeks → use last 40 weekly closes
    const closes     = chart?.closes     ?? [];
    const timestamps = chart?.timestamps ?? [];
    let ma200      = null;
    let aboveMA200 = null;
    if (closes.length >= 20 && price != null) {
      ma200 = calcSMA(closes, Math.min(40, closes.length));
      if (ma200 != null) aboveMA200 = price >= ma200;
    }
    const rsi   = closes.length >= 15 ? calcRSI(closes) : null;
    const highs = countHighs(closes, timestamps);

    // ── Sector key from Finnhub profile (same getSectorKey logic as scoring.js)
    const sectorKey = getSectorKey(profile?.finnhubIndustry ?? null);

    // Finnhub returns growth metrics already in % (e.g. 33 = 33%), EDGAR returns decimal (0.33)
    // Normalize everything to % so scoring thresholds (-30..40) work correctly
    const epsGrowthFinal      = m.epsGrowth3Y     != null ? m.epsGrowth3Y
                              : edgar?.epsGrowth   != null ? edgar.epsGrowth * 100
                              : m.epsGrowthTTMYoy  ?? null;
    const revenueGrowthFinal  = m.revenueGrowth3Y    != null ? m.revenueGrowth3Y
                              : edgar?.revenueGrowth  != null ? edgar.revenueGrowth * 100
                              : m.revenueGrowthTTMYoy ?? null;
    // scoreDebt expects ratio (e.g. 0.66), not percent — no *100
    const debtEquityFinal     = edgar?.debtEquity     ?? m['longTermDebt/equityAnnual'] ?? m['totalDebt/totalEquityAnnual'] ?? null;
    const fcfFinal            = edgar?.fcf            ?? syntheticFCF;
    // EDGAR returns decimal (0.32), Finnhub returns percent (32)
    // Discard EDGAR value if > 80% — means wrong revenue concept was fetched
    const edgarOpMargin = (edgar?.operatingMargin != null && edgar.operatingMargin <= 0.8)
                        ? edgar.operatingMargin * 100 : null;
    const opMarginFinal = edgarOpMargin ?? m.operatingMarginTTM ?? null;

    // ── PEG — FMP first (most accurate), Finnhub second, synthetic fallback ──
    const peFinal = m.peTTM ?? null;
    const pegFMP  = fmpMetrics?.peg ?? null;
    const pegFinnhub = m.pegNormalizedAnnual ?? null;
    const pegSynthetic = (peFinal != null && peFinal > 0 && epsGrowthFinal != null && epsGrowthFinal > 0)
      ? peFinal / epsGrowthFinal
      : null;
    const pegFinal = pegFMP ?? pegFinnhub ?? pegSynthetic;

    // ── Growth family (35%) ───────────────────────────────────────
    const familyGrowth = wAvg([
      { score: scoreEPSSurprise(epsSurprise),         weight: GROWTH_WEIGHTS.epsSurprise },
      { score: scoreEPS(epsGrowthFinal),              weight: GROWTH_WEIGHTS.eps         },
      { score: scoreRevenue(revenueGrowthFinal),      weight: GROWTH_WEIGHTS.revenue     },
    ]);

    // ── Valuation family (25%) ────────────────────────────────────
    const familyValuation = wAvg([
      { score: scorePEG(pegFinal), weight: VALUATION_WEIGHTS.peg },
      { score: scoreFCF(fcfFinal, marketCap),           weight: VALUATION_WEIGHTS.fcf },
      { score: scorePEonly(m.peTTM ?? null, sectorKey), weight: VALUATION_WEIGHTS.pe  },
    ]);

    // ── Quality family (20%) ──────────────────────────────────────
    // insiderOwnership: prefer Form-4 transactions score; fallback to raw % if no EDGAR data
    const insiderScore = scoreInsiderTransactions(insiderTxn) ?? scoreInsiderOwnership(insiderOwnership);
    const familyQuality = wAvg([
      { score: scoreOperatingMargin(opMarginFinal, sectorKey), weight: QUALITY_WEIGHTS.operatingMargin  },
      { score: insiderScore,                                    weight: QUALITY_WEIGHTS.insiderOwnership },
      { score: scoreROE(m.roeTTM ?? null),                     weight: QUALITY_WEIGHTS.roe              },
      { score: scoreCurrentRatio(m.currentRatioAnnual ?? null),weight: QUALITY_WEIGHTS.currentRatio     },
    ]);

    // ── Technical family (20%) ────────────────────────────────────
    const macdVal = calcMACD(closes);
    const familyTechnical = wAvg([
      { score: scoreMA200Position(price, ma200),   weight: TECHNICAL_WEIGHTS.ma200        },
      { score: scoreDistFromHigh(price, high52w),  weight: TECHNICAL_WEIGHTS.distFromHigh },
      { score: scoreMACD(macdVal, price),          weight: TECHNICAL_WEIGHTS.macd         },
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
      // Identity + score
      symbol, name, score, rating,

      // Live price (from chart)
      price, changePct,
      high52w,
      low52w: chart?.low52 ?? null,
      ath: chart?.ath ?? null,
      aboveMA200,

      // Market data
      marketCap,
      volume:    chart?.volume    ?? null,
      avgVolume: chart?.avgVolume ?? null,

      // Fundamentals from Finnhub metrics
      pe:              m.peTTM ?? null,
      pb:              m.pbAnnual ?? null,
      ps:              m.psAnnual ?? null,
      peg:             pegFinal,
      beta:            m.beta ?? null,
      dividend:        m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual / 100 : null,
      debtEquity:      debtEquityFinal,
      roe:             m.roeTTM ?? null,
      currentRatio:    m.currentRatioAnnual ?? null,
      operatingMargin: opMarginFinal, // already in %
      insiderOwnership,
      insiderTxn,
      shortFloat,
      epsGrowth:       epsGrowthFinal,    // already in %
      revenueGrowth:   revenueGrowthFinal, // already in %
      epsSurprise,
      fcf:             fcfFinal,

      // Profile from Finnhub
      sector:          profile?.finnhubIndustry ?? null,
      sectorKey,
      description:     profile?.description ?? null,
      employees:       profile?.employeeTotal ?? null,
      website:         profile?.weburl ?? null,
      country:         profile?.country ?? null,
      exchange:        profile?.exchange ?? null,

      // Technicals (raw values)
      rsi,
      macd:            calcMACD(closes),
      ma200,

      // Criterion scores (0-100) - precomputed
      criteria: {
        eps:              scoreEPS(epsGrowthFinal),
        revenue:          scoreRevenue(revenueGrowthFinal),
        epsSurprise:      scoreEPSSurprise(epsSurprise),
        peg:              scorePEG(pegFinal),
        fcf:              scoreFCF(fcfFinal, marketCap),
        peOnly:           scorePEonly(m.peTTM ?? null, sectorKey),
        multiples:        scoreMultiples(m.peTTM ?? null, m.pbAnnual ?? null, m.psAnnual ?? null, sectorKey),
        operatingMargin:  scoreOperatingMargin(opMarginFinal, sectorKey),
        insiderOwnership: insiderScore,
        roe:              scoreROE(m.roeTTM ?? null),
        currentRatio:     scoreCurrentRatio(m.currentRatioAnnual ?? null),
        ma200:            scoreMA200Position(price, ma200),
        distFromHigh:     scoreDistFromHigh(price, high52w),
        shortFloat:       scoreShortFloat(shortFloat),  // kept for display; not in family
        macdScore:        scoreMACD(macdVal, price),
        rsiScore:         scoreRSI(rsi),
        debt:             scoreDebt(debtEquityFinal, sectorKey),
        institutional:    null,
        analysts:         null,
        momentum:         scoreMomentum(changePct, price, high52w, low52w),
        technical:        null,
        ath:              scoreATH(price, high52w, chart?.ath ?? null),
        highs:            scoreHighs(highs),
      },

      // Family scores
      families: {
        growth:    familyGrowth    != null ? Math.round(familyGrowth)    : null,
        valuation: familyValuation != null ? Math.round(familyValuation) : null,
        quality:   familyQuality   != null ? Math.round(familyQuality)   : null,
        technical: familyTechnical != null ? Math.round(familyTechnical) : null,
      },

      // Technicals object
      technicals: {
        rsi,
        macd:     calcMACD(closes),
        athPrice: chart?.ath ?? null,
        highs,
      },
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

// ── Fetch Finnhub quarterly earnings (for EPS Surprise) ──────────────────────
async function fetchFinnhubEarnings(symbol, key) {
  if (!key) return null;
  const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(symbol)}&limit=4&token=${key}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

// ── Fetch Finnhub short interest ──────────────────────────────────────────────
async function fetchFinnhubShortInterest(symbol, key) {
  if (!key) return null;
  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url  = `https://finnhub.io/api/v1/stock/short-interest?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${key}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Fetch Finnhub company profile (for sector) ────────────────────────────────
async function fetchFinnhubProfile(symbol, key) {
  if (!key) return null;
  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Fetch Yahoo Finance chart (close prices + meta) ───────────────────────────
// Uses 5Y weekly: gives enough data for ATH, MA200 (weekly), and RSI.
// high52 / low52 still come from Yahoo meta (always accurate).
// ── SEC EDGAR CIK map ─────────────────────────────────────────────────────────
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
  ENPH:'1463101',FSLR:'1274439',
  BP:'313807',CVS:'1547903',WBA:'105378',ELV:'1156039',CI:'723254',
  HCA:'860731',MDT:'310764',ABT:'1800',TMO:'97210',DHR:'790070',
  SYK:'310764',ZTS:'1555280',ISRG:'1035267',REGN:'872589',VRTX:'875320',
  GILD:'882095',BIIB:'875045',NEE:'753308',DUK:'18978',SO:'92521',
  AEP:'4904',SRE:'1032975',PLD:'1045609',AMT:'1053507',EQIX:'1101239',
  PSA:'77890',SPG:'1063761',SBUX:'829224',TGT:'27419',LOW:'60667',
  NKE:'320187',TJX:'109198',BKNG:'1075531',MAR:'1048268',HLT:'1466132',
  USB:'36270',PNC:'713676',TFC:'92230',COF:'927628',BLK:'1364742',
  AXP:'4962',SCHW:'316943',SPGI:'64040',MCO:'1059556',ICE:'1571949',
  CME:'1156375',CB:'896159',PGR:'80661',MMC:'62234',MET:'1099219',
  PRU:'1137774',AFL:'4977',ALL:'899051',AIG:'5272',AMGN:'318154',
  BMY:'14272',BSX:'1035267',EW:'1099800',BDX:'10795',RMD:'845733',
  WM:'823768',RSG:'1060349',DE:'315189',HON:'773840',RTX:'101829',
  LMT:'936468',NOC:'1133421',GD:'40533',EMR:'32604',ETN:'31462',
  PH:'76334',MMM:'66740',
};

async function fetchEdgarConcept(cik, concept, unit = 'USD') {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${String(cik).padStart(10,'0')}/us-gaap/${concept}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [null, null];
    const j = await res.json();
    const arr = (j?.units?.[unit] ?? [])
      .filter(d => (d.form === '10-K' || d.form === '20-F') && d.val != null)
      .sort((a, b) => b.end.localeCompare(a.end));
    return [arr[0]?.val ?? null, arr[1]?.val ?? null];
  } catch { return [null, null]; }
}

// ── Insider Transactions from SEC EDGAR Form 4 ───────────────────────────────
async function fetchInsiderTransactions(symbol) {
  const cik = EDGAR_CIK[symbol.toUpperCase()];
  if (!cik) return null;
  try {
    const paddedCik = String(cik).padStart(10, '0');
    const res = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
      headers: { 'User-Agent': 'BullTherapy/1.0 info@bulltherapy.com' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const sub = await res.json();

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const forms    = sub.filings?.recent?.form           ?? [];
    const dates    = sub.filings?.recent?.filingDate     ?? [];
    const accNums  = sub.filings?.recent?.accessionNumber ?? [];
    const primDocs = sub.filings?.recent?.primaryDocument ?? [];

    const recent = [];
    for (let i = 0; i < forms.length && recent.length < 8; i++) {
      if (forms[i] === '4' && dates[i] >= cutoffStr) {
        // primaryDocument may have an XSL prefix like "xslF345X06/form4.xml" — strip it
        const rawDoc = primDocs[i];
        const docFile = rawDoc.includes('/') ? rawDoc.split('/').slice(1).join('/') : rawDoc;
        recent.push({ acc: accNums[i].replace(/-/g, ''), doc: docFile });
      }
    }
    if (!recent.length) return { buys: 0, sells: 0 };

    let buys = 0, sells = 0;
    await Promise.allSettled(recent.slice(0, 5).map(async ({ acc, doc }) => {
      try {
        const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${doc}`;
        const xmlRes = await fetch(xmlUrl, {
          headers: { 'User-Agent': 'BullTherapy/1.0 info@bulltherapy.com' },
          signal: AbortSignal.timeout(5000),
        });
        if (!xmlRes.ok) return;
        const xml = await xmlRes.text();
        // Match both plain (<transactionAcquiredDisposedCode>A</...>) and nested (<value>A</value>) formats
        const blocks = xml.match(/<transactionAcquiredDisposedCode>[\s\S]*?<\/transactionAcquiredDisposedCode>/gi) || [];
        for (const block of blocks) {
          if (/<value>\s*A\s*<\/value>/i.test(block) || /^<transactionAcquiredDisposedCode>\s*A\s*<\/transactionAcquiredDisposedCode>$/i.test(block.trim())) {
            buys++;
          } else if (/<value>\s*D\s*<\/value>/i.test(block) || /^<transactionAcquiredDisposedCode>\s*D\s*<\/transactionAcquiredDisposedCode>$/i.test(block.trim())) {
            sells++;
          }
        }
      } catch {}
    }));

    return { buys, sells };
  } catch { return null; }
}

function scoreInsiderTransactions(data) {
  if (!data) return null;
  const { buys, sells } = data;
  const total = buys + sells;
  if (total === 0) return 50; // no activity = neutral
  return Math.round(10 + (buys / total) * 80); // 100% buys→90, 100% sells→10
}

async function fetchEdgarFundamentals(symbol, price) {
  const cik = EDGAR_CIK[symbol.toUpperCase()];
  if (!cik || !price) return null;
  try {
    const [
      [eps, epsPrev], [rev, revPrev], [rev2, rev2Prev], [rev3],
      [equity], [shares], [debt], [operatingCF], [capex], [operatingIncome],
    ] = await Promise.all([
      fetchEdgarConcept(cik, 'EarningsPerShareDiluted', 'USD/shares'),
      fetchEdgarConcept(cik, 'Revenues'),
      fetchEdgarConcept(cik, 'RevenueFromContractWithCustomerExcludingAssessedTax'),
      fetchEdgarConcept(cik, 'RevenuesNetOfInterestExpense'),
      fetchEdgarConcept(cik, 'StockholdersEquity'),
      fetchEdgarConcept(cik, 'CommonStockSharesOutstanding', 'shares'),
      fetchEdgarConcept(cik, 'LongTermDebt'),
      fetchEdgarConcept(cik, 'NetCashProvidedByUsedInOperatingActivities'),
      fetchEdgarConcept(cik, 'PaymentsToAcquirePropertyPlantAndEquipment'),
      fetchEdgarConcept(cik, 'OperatingIncomeLoss'),
    ]);
    const revActual     = rev  ?? rev2  ?? rev3  ?? null;
    const revPrevActual = revPrev ?? rev2Prev ?? null;
    const epsGrowth = (eps && epsPrev && epsPrev > 0)
      ? (eps - epsPrev) / epsPrev : null; // decimal — skip if base year was a loss
    const revenueGrowth = (revActual && revPrevActual && revPrevActual !== 0)
      ? (revActual - revPrevActual) / Math.abs(revPrevActual) : null; // decimal
    const debtEquity = (debt != null && equity && equity !== 0)
      ? debt / equity : null; // ratio (e.g. 0.66)
    const fcf = (operatingCF != null && capex != null) ? operatingCF - capex
              : operatingCF != null ? operatingCF : null;
    const operatingMargin = (operatingIncome != null && revActual && revActual !== 0)
      ? operatingIncome / revActual : null; // decimal
    return { epsGrowth, revenueGrowth, debtEquity, fcf, operatingMargin };
  } catch { return null; }
}

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
    const rawCloses     = result.indicators?.quote?.[0]?.close ?? [];
    const rawTimestamps = result.timestamp ?? [];
    // Keep only entries where close is not null
    const closes     = [];
    const timestamps = [];
    for (let i = 0; i < rawCloses.length; i++) {
      if (rawCloses[i] != null) {
        closes.push(rawCloses[i]);
        timestamps.push(rawTimestamps[i] ?? null);
      }
    }
    const price     = meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : null);
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
    // Use Yahoo's own changePercent — correctly reflects last session's change even when market is closed
    const changePct = meta.regularMarketChangePercent != null
      ? meta.regularMarketChangePercent
      : price != null && prevClose != null && prevClose !== 0
        ? ((price - prevClose) / prevClose) * 100
        : null;
    // ATH = max close over 5 years
    const ath = closes.length ? Math.max(...closes) : null;
    return {
      closes,
      timestamps,
      price,
      name:      meta.longName ?? meta.shortName ?? symbol,
      changePct,
      high52:    meta.fiftyTwoWeekHigh ?? null,
      low52:     meta.fiftyTwoWeekLow  ?? null,
      ath,
      volume:    meta.regularMarketVolume ?? null,
      avgVolume: meta.averageDailyVolume3Month ?? meta.averageDailyVolume10Day ?? null,
    };
  } catch { return null; }
}

// ── Scoring engine — exact mirror of scoring.js ───────────────────────────────
// Family weights (identical to scoring.js)
const FAMILY_WEIGHTS    = { growth: 0.35, valuation: 0.25, quality: 0.20, technical: 0.20 };
const GROWTH_WEIGHTS    = { epsSurprise: 0.50, eps: 0.30, revenue: 0.20 };
const VALUATION_WEIGHTS = { peg: 0.50, fcf: 0.30, pe: 0.20 };
const QUALITY_WEIGHTS   = { operatingMargin: 0.35, insiderOwnership: 0.25, roe: 0.25, currentRatio: 0.15 };
const TECHNICAL_WEIGHTS = { ma200: 0.40, distFromHigh: 0.25, macd: 0.20, rsi: 0.15 };

const SECTOR_PE = {
  technology: [15,25,40,60], financials: [8,12,18,25], energy: [8,12,18,25],
  healthcare: [12,20,30,45], real_estate: [15,25,40,60], consumer: [12,18,28,40],
  industrials: [12,18,25,35], communication: [12,20,35,55], utilities: [14,18,25,35],
  materials: [10,15,22,30], default: [12,20,35,55],
};

const SECTOR_PB = {
  technology:    [1, 3, 6, 12],
  financials:    [0.8, 1.2, 2, 3.5],
  energy:        [1, 1.5, 2.5, 4],
  healthcare:    [2, 4, 7, 12],
  real_estate:   [1, 1.5, 2.5, 4],
  consumer:      [1.5, 3, 5, 8],
  industrials:   [1.5, 2.5, 4, 7],
  communication: [1.5, 3, 5, 9],
  utilities:     [1, 1.5, 2.5, 4],
  materials:     [1, 2, 3.5, 6],
  default:       [1, 3, 6, 12],
};

const SECTOR_PS = {
  technology:    [2, 5, 10, 20],
  financials:    [1, 2, 4, 7],
  energy:        [0.5, 1, 2, 3.5],
  healthcare:    [1, 3, 6, 12],
  real_estate:   [3, 6, 10, 16],
  consumer:      [0.3, 0.8, 1.5, 3],
  industrials:   [0.5, 1, 2, 3.5],
  communication: [1, 3, 6, 10],
  utilities:     [1, 2, 3.5, 5],
  materials:     [0.5, 1, 2, 3.5],
  default:       [1, 3, 6, 12],
};

function getSectorKey(sector) {
  if (!sector) return 'default';
  const s = sector.toLowerCase();
  if (s.includes('tech'))                       return 'technology';
  if (s.includes('financ') || s.includes('bank') || s.includes('insur')) return 'financials';
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

// MACD score: normalised to price so it's comparable across stocks
// macd/price as % → bullish = high score, bearish = low score
function scoreMACD(macd, price) {
  if (macd == null || price == null || price === 0) return null;
  const pct = (macd / price) * 100; // e.g. +2 = 2% above signal
  if (pct >=  3) return 90;
  if (pct >=  1) return 75;
  if (pct >=  0) return 60;
  if (pct >= -1) return 40;
  if (pct >= -3) return 25;
  return 10;
}

function scoreRSI(rsi) {
  if (rsi == null) return null;
  if (rsi < 30) return 70; if (rsi < 50) return 80;
  if (rsi < 65) return 65; if (rsi < 75) return 35;
  return 15;
}

function scoreMomentum(changePct, price, high52w, low52w) {
  if (changePct == null) return null;
  const dailyScore = normalizeLinear(changePct, -5, 5);
  if (high52w == null || low52w == null || price == null) return dailyScore;
  const range = high52w - low52w;
  if (range === 0) return dailyScore;
  const position = (price - low52w) / range;
  return (dailyScore * 0.4 + position * 100 * 0.6);
}

function countHighs(closes, timestamps) {
  if (!closes || !timestamps || closes.length < 2) return { y1: 0, y3: 0, y5: 0 };
  const now = Date.now() / 1000;
  const y1 = now - 365 * 86400;
  const y3 = now - 3 * 365 * 86400;
  const y5 = now - 5 * 365 * 86400;
  let max = 0, h1 = 0, h3 = 0, h5 = 0;
  for (let i = 0; i < closes.length; i++) {
    const p = closes[i];
    const t = timestamps[i];
    if (p > max) {
      max = p;
      if (t >= y1) h1++;
      if (t >= y3) h3++;
      if (t >= y5) h5++;
    }
  }
  return { y1: h1, y3: h3, y5: h5 };
}

function scoreHighs(highsBroken) {
  if (!highsBroken) return null;
  const { y1 = 0, y3 = 0, y5 = 0 } = highsBroken;
  return Math.min(100, (y1 * 20 + y3 * 10 + y5 * 5));
}

function scoreMultiples(pe, pb, ps, sectorKey) {
  const scores = [];
  if (pe != null && pe > 0) scores.push(normalizeInverse(pe, SECTOR_PE[sectorKey] || SECTOR_PE.default));
  if (pb != null && pb > 0) scores.push(normalizeInverse(pb, SECTOR_PB[sectorKey] || SECTOR_PB.default));
  if (ps != null && ps > 0) scores.push(normalizeInverse(ps, SECTOR_PS[sectorKey] || SECTOR_PS.default));
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function scoreDebt(debtEquity, sectorKey) {
  if (debtEquity == null) return null;
  const highDebtSectors = ['financials', 'real_estate', 'utilities'];
  const max = highDebtSectors.includes(sectorKey) ? 10.0 : 2.0;
  return Math.max(0, 100 - normalizeLinear(debtEquity, 0, max));
}

function scoreATH(price, high52w, ath) {
  if (price == null || high52w == null) return null;
  const distFrom52w = ((high52w - price) / high52w) * 100;
  const fromHigh = normalizeInverse(distFrom52w, [0, 10, 30, 50]);
  if (!ath || ath <= high52w) return fromHigh;
  const distFromATH = ((ath - price) / ath) * 100;
  const fromATH = normalizeInverse(distFromATH, [0, 15, 40, 65]);
  return (fromHigh * 0.6 + fromATH * 0.4);
}

function calcEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcMACD(closes) {
  if (closes.length < 26) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  return ema12 - ema26;
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

// ── Internal Finviz fetch (used by scoreStock) ────────────────────────────────
async function fetchFinvizData(symbol) {
  try {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}&p=d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finviz.com/',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const data = {};
    for (const [, label, value] of html.matchAll(
      /<td[^>]*class="[^"]*snapshot-td2-cp[^"]*"[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*class="[^"]*snapshot-td2[^"]*"[^>]*><b>\s*([^<]*?)\s*<\/b>/g
    )) { data[label.trim()] = value.trim(); }

    const pct = (s) => (s && s !== '-') ? parseFloat(s) : null;
    return {
      shortFloat:   pct(data['Short Float']),   // e.g. "2.45" → 2.45%
      insiderOwn:   pct(data['Insider Own']),    // e.g. "0.28" → 0.28%
      instOwn:      pct(data['Inst Own']),       // e.g. "72.5" → 72.5%
    };
  } catch { return null; }
}

// ── FMP: PEG ratio from /stable/ratios-ttm ────────────────────────────────────
async function fetchFMPKeyMetrics(symbol, fmpKey) {
  if (!fmpKey) return null;
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(symbol)}&apikey=${fmpKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row['Error Message']) return null;
    // priceToEarningsGrowthRatioTTM = PEG ratio
    const peg = row.priceToEarningsGrowthRatioTTM ?? null;
    return { peg: (peg != null && isFinite(peg) && peg > 0) ? peg : null };
  } catch { return null; }
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

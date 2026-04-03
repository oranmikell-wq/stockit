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

// ── S&P 500 Universe (~150 most liquid stocks) ───────────────────────────────
const SP500_UNIVERSE = [
  // Mega cap tech
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','ORCL','CRM',
  // Tech
  'AMD','QCOM','ADBE','NOW','INTU','TXN','AMAT','MU','LRCX','KLAC',
  'ADI','SNPS','CDNS','MRVL','FTNT','PANW','CRWD','NET','DDOG','SNOW',
  // Financials
  'JPM','BAC','WFC','GS','MS','BLK','AXP','SCHW','CB','SPGI',
  'MCO','ICE','CME','PGR','MMC','USB','PNC','TFC','COF','AIG',
  // Healthcare
  'LLY','UNH','JNJ','ABBV','MRK','TMO','ABT','DHR','AMGN','PFE',
  'MDT','BMY','GILD','ISRG','VRTX','REGN','SYK','BSX','ZTS','CI',
  // Consumer Discretionary
  'COST','WMT','HD','MCD','NKE','SBUX','TJX','LOW','TGT','BKNG',
  'DG','DLTR','ROST','YUM','CMG','ORLY','AZO','DHI','LEN','NVR',
  // Consumer Staples
  'PG','KO','PEP','PM','MO','MDLZ','CL','EL','KMB','GIS',
  // Industrials
  'CAT','DE','HON','RTX','LMT','GE','UPS','FDX','CSX','UNP',
  'NSC','EMR','ETN','PH','ROK','LHX','NOC','GD','HWM','CARR',
  // Energy
  'XOM','CVX','COP','EOG','SLB','PSX','VLO','MPC','OXY','HAL',
  // Communication
  'NFLX','DIS','CMCSA','T','VZ','TMUS','CHTR','TTWO','EA','WBD',
  // Utilities
  'NEE','SO','DUK','AEP','SRE','EXC','XEL','D',
  // Real Estate
  'PLD','AMT','EQIX','CCI','PSA','O','WELL','DLR',
  // Materials
  'LIN','APD','SHW','ECL','NEM','FCX','PPG','VMC',
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
const KV_KEY = 'top-picks-v1';

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
  const auth = await getYahooCrumb();
  const results = [];
  const BATCH = 8;

  for (let i = 0; i < SP500_UNIVERSE.length; i += BATCH) {
    const batch = SP500_UNIVERSE.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(sym => scoreStock(sym, auth)));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    // Polite delay between batches
    if (i + BATCH < SP500_UNIVERSE.length) await sleep(400);
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

// ── Score a single stock ──────────────────────────────────────────────────────
async function scoreStock(symbol, auth) {
  try {
    const [fundamentals, chart] = await Promise.all([
      fetchFundamentals(symbol, auth),
      fetchChart(symbol, auth),
    ]);

    if (!fundamentals) return null;

    const f  = fundamentals.financialData        || {};
    const ks = fundamentals.defaultKeyStatistics || {};
    const sd = fundamentals.summaryDetail        || {};
    const et = fundamentals.earningsTrend?.trend?.[0] || {};
    const ap = fundamentals.assetProfile         || {};

    const price    = f.currentPrice?.raw ?? sd.regularMarketPrice?.raw ?? null;
    const name     = fundamentals.quoteType?.longName ?? fundamentals.quoteType?.shortName ?? symbol;
    const sector   = ap.sector ?? '';
    const marketCap = sd.marketCap?.raw ?? ks.enterpriseValue?.raw ?? null;

    // ── Growth (35%) ──────────────────────────────────────────────
    // EPS Surprise
    const epsActual   = et.actual?.raw   ?? null;
    const epsEstimate = et.estimate?.raw ?? null;
    let epsSurpriseScore = null;
    if (epsActual != null && epsEstimate != null && Math.abs(epsEstimate) > 0.001) {
      const surprise = (epsActual - epsEstimate) / Math.abs(epsEstimate);
      epsSurpriseScore = clamp(50 + surprise * 200, 0, 100);
    }

    // EPS Growth
    const epsGrowth = f.earningsGrowth?.raw ?? ks.earningsQuarterlyGrowth?.raw ?? null;
    const epsGrowthScore = epsGrowth != null
      ? clamp(50 + epsGrowth * 100, 0, 100)
      : null;

    // Revenue Growth
    const revGrowth = f.revenueGrowth?.raw ?? null;
    const revGrowthScore = revGrowth != null
      ? clamp(50 + revGrowth * 150, 0, 100)
      : null;

    const growthScore = weightedAvg([
      [epsSurpriseScore, 0.50],
      [epsGrowthScore,   0.30],
      [revGrowthScore,   0.20],
    ]);

    // ── Valuation (25%) ───────────────────────────────────────────
    // PEG Ratio (lower = better, 1.0 is fair value)
    const peg = ks.pegRatio?.raw ?? ks.trailingPegRatio?.raw ?? null;
    const pegScore = peg != null && peg > 0
      ? clamp(peg <= 1 ? 90 : peg <= 2 ? 70 : peg <= 3 ? 45 : 20, 0, 100)
      : null;

    // FCF Yield
    const fcf = f.freeCashflow?.raw ?? null;
    let fcfYieldScore = null;
    if (fcf != null && marketCap != null && marketCap > 0) {
      const yield_ = fcf / marketCap;
      fcfYieldScore = clamp(yield_ >= 0.08 ? 95 : yield_ >= 0.05 ? 80 : yield_ >= 0.03 ? 65 : yield_ >= 0.01 ? 45 : yield_ >= 0 ? 30 : 15, 0, 100);
    }

    // P/E
    const pe = sd.trailingPE?.raw ?? f.currentPrice?.raw && f.targetMeanPrice?.raw ? null : null;
    const trailingPE = sd.trailingPE?.raw ?? null;
    const peScore = trailingPE != null && trailingPE > 0
      ? clamp(trailingPE <= 15 ? 90 : trailingPE <= 25 ? 75 : trailingPE <= 35 ? 55 : trailingPE <= 50 ? 35 : 15, 0, 100)
      : null;

    const valuationScore = weightedAvg([
      [pegScore,      0.50],
      [fcfYieldScore, 0.30],
      [peScore,       0.20],
    ]);

    // ── Quality (20%) ─────────────────────────────────────────────
    // Operating Margin
    const opMargin = f.operatingMargins?.raw ?? null;
    const opMarginScore = opMargin != null
      ? clamp(opMargin >= 0.30 ? 95 : opMargin >= 0.20 ? 80 : opMargin >= 0.10 ? 65 : opMargin >= 0.05 ? 45 : opMargin >= 0 ? 25 : 10, 0, 100)
      : null;

    // Insider Ownership
    const insiderOwn = ks.heldPercentInsiders?.raw ?? null;
    const insiderScore = insiderOwn != null
      ? clamp(insiderOwn >= 0.20 ? 90 : insiderOwn >= 0.10 ? 78 : insiderOwn >= 0.05 ? 65 : insiderOwn >= 0.02 ? 50 : 35, 0, 100)
      : null;

    // ROE
    const roe = f.returnOnEquity?.raw ?? null;
    const roeScore = roe != null
      ? clamp(roe >= 0.30 ? 95 : roe >= 0.20 ? 82 : roe >= 0.10 ? 65 : roe >= 0.05 ? 45 : roe >= 0 ? 25 : 10, 0, 100)
      : null;

    // Current Ratio
    const cr = f.currentRatio?.raw ?? null;
    const crScore = cr != null
      ? clamp(cr >= 2.0 ? 85 : cr >= 1.5 ? 75 : cr >= 1.0 ? 60 : cr >= 0.8 ? 40 : 20, 0, 100)
      : null;

    const qualityScore = weightedAvg([
      [opMarginScore, 0.35],
      [insiderScore,  0.25],
      [roeScore,      0.25],
      [crScore,       0.15],
    ]);

    // ── Technical (20%) ───────────────────────────────────────────
    // MA200 from chart
    let ma200Score = null;
    if (chart && chart.length >= 50 && price != null) {
      const ma200 = calcSMA(chart, 200);
      if (ma200 != null) {
        const pct = (price - ma200) / ma200;
        ma200Score = pct >= 0.10 ? 92 : pct >= 0.05 ? 80 : pct >= 0 ? 65 : pct >= -0.05 ? 45 : pct >= -0.15 ? 30 : 15;
      }
    }

    // Distance from 52W High
    const high52 = sd.fiftyTwoWeekHigh?.raw ?? null;
    let dist52Score = null;
    if (high52 != null && price != null && high52 > 0) {
      const dist = (price - high52) / high52; // negative = below high
      dist52Score = dist >= -0.05 ? 90 : dist >= -0.10 ? 78 : dist >= -0.20 ? 62 : dist >= -0.35 ? 45 : dist >= -0.50 ? 28 : 12;
    }

    // Short Float (lower = better)
    const shortFloat = ks.shortPercentOfFloat?.raw ?? null;
    const shortScore = shortFloat != null
      ? clamp(shortFloat <= 0.02 ? 90 : shortFloat <= 0.05 ? 75 : shortFloat <= 0.10 ? 58 : shortFloat <= 0.20 ? 38 : 18, 0, 100)
      : null;

    // RSI from chart
    let rsiScore = null;
    if (chart && chart.length >= 15) {
      const rsi = calcRSI(chart, 14);
      if (rsi != null) {
        rsiScore = rsi < 30 ? 65 : rsi < 40 ? 55 : rsi < 65 ? 82 : rsi < 75 ? 40 : 18;
      }
    }

    const technicalScore = weightedAvg([
      [ma200Score, 0.40],
      [dist52Score, 0.25],
      [shortScore,  0.20],
      [rsiScore,    0.15],
    ]);

    // ── Final score ───────────────────────────────────────────────
    const finalScore = weightedAvg([
      [growthScore,    0.35],
      [valuationScore, 0.25],
      [qualityScore,   0.20],
      [technicalScore, 0.20],
    ]);

    if (finalScore == null) return null;

    const score  = Math.round(finalScore);
    const rating = score >= 66 ? 'buy' : score >= 41 ? 'wait' : 'sell';

    return {
      symbol,
      name,
      sector,
      score,
      rating,
      price,
      changePct: sd.regularMarketChangePercent?.raw != null
        ? sd.regularMarketChangePercent.raw * 100
        : null,
      breakdown: {
        growth:    growthScore    != null ? Math.round(growthScore)    : null,
        valuation: valuationScore != null ? Math.round(valuationScore) : null,
        quality:   qualityScore   != null ? Math.round(qualityScore)   : null,
        technical: technicalScore != null ? Math.round(technicalScore) : null,
      },
    };

  } catch (e) {
    console.warn(`[Scanner] ${symbol}: ${e.message}`);
    return null;
  }
}

// ── Fetch Yahoo Finance fundamentals ──────────────────────────────────────────
async function fetchFundamentals(symbol, auth) {
  const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,earningsTrend,quoteType';
  const crumbStr = auth?.crumb ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&formatted=true&corsDomain=finance.yahoo.com${crumbStr}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(auth?.cookieStr ? { 'Cookie': auth.cookieStr } : {}),
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.quoteSummary?.result?.[0] ?? null;
}

// ── Fetch Yahoo Finance chart (close prices) ──────────────────────────────────
async function fetchChart(symbol, auth) {
  const crumbStr = auth?.crumb ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false${crumbStr}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json',
      ...(auth?.cookieStr ? { 'Cookie': auth.cookieStr } : {}),
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(v => v != null);
}

// ── Scoring helpers ───────────────────────────────────────────────────────────
function weightedAvg(pairs) {
  const valid = pairs.filter(([v]) => v != null);
  if (!valid.length) return null;
  const totalW = valid.reduce((s, [, w]) => s + w, 0);
  return valid.reduce((s, [v, w]) => s + v * w, 0) / totalW;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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
    if (diff >= 0) gains += diff; else losses -= diff;
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

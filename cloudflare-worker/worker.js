/**
 * Cloudflare Worker — CORS Proxy for BullTherapy
 *
 * Special handling: requests to finance.yahoo.com/quote/{symbol}/
 * are intercepted — the Worker fetches the HTML page, extracts the
 * full quoteSummary JSON that Yahoo Finance embeds as a SvelteKit
 * data island, and returns only that JSON.  This avoids needing a
 * crumb token for the v10/quoteSummary API.
 */

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

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const { searchParams } = new URL(request.url);
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

    // ── Special case: extract quoteSummary from Yahoo Finance HTML page ──
    if (parsedUrl.hostname === 'finance.yahoo.com' &&
        parsedUrl.pathname.startsWith('/quote/')) {
      return handleYahooQuotePage(parsedUrl.toString(), origin);
    }

    // ── Special case: crumb-based quoteSummary fetch ─────────────────────
    if ((parsedUrl.hostname === 'query1.finance.yahoo.com' || parsedUrl.hostname === 'query2.finance.yahoo.com') &&
        parsedUrl.pathname.includes('/quoteSummary/')) {
      return handleYahooFundamentals(parsedUrl, origin);
    }

    // ── Special case: parse AAII sentiment survey page into JSON ──
    if (parsedUrl.hostname === 'www.aaii.com' &&
        parsedUrl.pathname === '/sentimentsurvey') {
      return handleAAIIPage(origin);
    }

    // ── Special case: parse Finviz quote page into JSON ──
    if (parsedUrl.hostname === 'finviz.com' &&
        parsedUrl.pathname === '/quote.ashx') {
      return handleFinvizPage(parsedUrl.toString(), origin);
    }

    // ── Standard proxy ───────────────────────────────────────────────────
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
};

// ── Finviz quote page → JSON ──────────────────────────────────────────────────
// Fetches the Finviz snapshot page and extracts key metrics as JSON.
// Useful for institutional ownership (Inst Own) and target price.
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
    if (!res.ok) {
      return new Response(JSON.stringify({}), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    const html = await res.text();

    // Finviz snapshot table — try multiple class-name patterns across redesigns
    const data = {};
    // Pattern 1: old snapshot-td2-cp / snapshot-td2 classes
    for (const [, label, value] of html.matchAll(
      /<td[^>]*class="[^"]*snapshot-td2-cp[^"]*"[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*class="[^"]*snapshot-td2[^"]*"[^>]*><b>\s*([^<]*?)\s*<\/b>/g
    )) { data[label.trim()] = value.trim(); }
    // Pattern 2: newer Finviz uses data-boxover or aria-label on table cells
    if (!Object.keys(data).length) {
      for (const [, label, value] of html.matchAll(
        /class="[^"]*snapshot-td[^"]*"[^>]*>\s*([A-Za-z][^<]{1,40}?)\s*<\/td>\s*<td[^>]*>\s*<b[^>]*>\s*([^<]+?)\s*<\/b>/g
      )) { data[label.trim()] = value.trim(); }
    }
    // Pattern 3: finviz.com/screener style key-value
    if (!Object.keys(data).length) {
      for (const [, label, value] of html.matchAll(
        /\bShort Float\b[^<]*<\/[^>]+>\s*<[^>]+>\s*<[^>]+>\s*([0-9.]+%?)/g
      )) { data['Short Float'] = value.trim(); }
    }

    const pct  = (s) => (s && s !== '-') ? parseFloat(s) / 100 : null;
    const num  = (s) => (s && s !== '-') ? parseFloat(s)       : null;

    return new Response(JSON.stringify({
      instOwn:     pct(data['Inst Own']),
      insiderOwn:  pct(data['Insider Own']),
      targetPrice: num(data['Target Price']),
      shortFloat:  pct(data['Short Float']),
    }), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({}), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
  }
}

// ── Yahoo Finance consent acceptance ─────────────────────────────────────────
// When Yahoo Finance serves a GDPR/privacy consent page, parse the form and
// POST acceptance to guce.yahoo.com to get proper session cookies.
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

// ── Yahoo Finance crumb+cookie auth helper ───────────────────────────────────
// Returns { cookieStr, crumb } or null.
async function getYahooCrumb() {
  const hdr    = { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9' };
  const htmlHdr = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };

  // Strategy A: crumb without cookies (works from non-GDPR IPs)
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v1/test/csrfToken', { headers: hdr });
    if (r.ok) {
      const j  = await r.json().catch(() => null);
      const cr = j?.csrfToken ?? j?.crumb ?? null;
      if (cr) {
        const rc = r.headers.getSetCookie?.() ?? [];
        return { cookieStr: rc.map(c => c.split(';')[0]).join('; '), crumb: cr };
      }
    }
  } catch {}

  // Strategy B: initialize Yahoo Finance session (with consent if needed), then get crumb
  try {
    const pageRes   = await fetch('https://finance.yahoo.com/', { headers: htmlHdr, redirect: 'follow' });
    const pageHtml  = await pageRes.text();
    const pageCookies = pageRes.headers.getSetCookie?.() ?? [];
    let cookieStr   = pageCookies.map(c => c.split(';')[0]).join('; ');

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
          const allStr = [...pageCookies, ...moreCookies].map(c => c.split(';')[0]).join('; ');
          return { cookieStr: allStr, crumb: cr };
        }
      }
    }
  } catch {}

  // Strategy C: v8/chart cookies fallback
  try {
    const chartRes = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d&includePrePost=false',
      { headers: hdr }
    );
    const rc = chartRes.headers.getSetCookie?.() ?? [];
    const cookieStr = rc.map(c => c.split(';')[0]).join('; ');
    if (cookieStr) {
      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/csrfToken', {
        headers: { ...hdr, 'Cookie': cookieStr },
      });
      if (crumbRes.ok) {
        const j  = await crumbRes.json().catch(() => null);
        const cr = j?.csrfToken ?? j?.crumb ?? null;
        if (cr) return { cookieStr, crumb: cr };
      }
    }
  } catch {}

  return null;
}

// Fetch Yahoo Finance fundamentals using cookie+crumb authentication.
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

// Yahoo Finance embeds the full quoteSummary response in a
// <script type="application/json" data-sveltekit-fetched> tag.
// We try multiple extraction strategies to handle different page layouts.
// Returns true if the HTML is a GDPR consent / privacy preference page (no stock data)
function isConsentPage(html) {
  return !html.includes('quoteSummary') && !html.includes('data-sveltekit-fetched') &&
    (html.includes('guce') || html.includes('consent') || html.includes('privacy') ||
     html.includes('\u05E4\u05E8\u05D8\u05D9\u05D5\u05EA')); // "פרטיות" (privacy in Hebrew)
}

async function handleYahooQuotePage(url, origin) {
  const hdrs = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  const err  = (msg, status = 502) =>
    new Response(JSON.stringify({ quoteSummary: { result: null, error: { code: 'WorkerError', description: msg } } }),
                 { status, headers: hdrs });

  const fetchPage = async (pageUrl, extraCookies = '') => {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
        'Cache-Control': 'no-cache',
        ...(extraCookies ? { 'Cookie': extraCookies } : {}),
      },
    });
    return res;
  };

  try {
    // First attempt
    let res = await fetchPage(url);
    if (!res.ok) return err(`HTTP ${res.status}`, res.status);
    let html = await res.text();

    // If consent page, accept consent automatically then retry
    if (isConsentPage(html)) {
      const initialCookies = res.headers.getSetCookie?.() ?? [];
      const consentCookieStr = await acceptYahooConsent(html, initialCookies).catch(() => null);
      if (consentCookieStr) {
        res = await fetchPage(url, consentCookieStr);
        if (res.ok) html = await res.text();
      }
      // Still consent? Try guccounter bypass with crumb cookies
      if (isConsentPage(html)) {
        const auth = await getYahooCrumb();
        const sep  = url.includes('?') ? '&' : '?';
        res  = await fetchPage(`${url}${sep}guccounter=1`, auth?.cookieStr ?? '');
        if (res.ok) html = await res.text();
      }
    }

    // Strategy 1: SvelteKit island filtered by quoteSummary in data-url (fast path)
    const m1 = html.match(/<script\s+type="application\/json"\s+data-sveltekit-fetched[^>]*data-url="[^"]*quoteSummary[^"]*"[^>]*>([\s\S]*?)<\/script>/);
    if (m1) {
      try {
        const outer = JSON.parse(m1[1]);
        const inner = JSON.parse(outer.body);
        if (inner?.quoteSummary?.result?.[0]) {
          return new Response(JSON.stringify(inner), { status: 200, headers: hdrs });
        }
      } catch {}
    }

    // Strategy 2: any SvelteKit data island that contains quoteSummary in its body
    for (const m of html.matchAll(/<script\s+type="application\/json"\s+data-sveltekit-fetched[^>]*>([\s\S]*?)<\/script>/g)) {
      try {
        const outer = JSON.parse(m[1]);
        const inner = typeof outer.body === 'string' ? JSON.parse(outer.body) : outer;
        if (inner?.quoteSummary?.result?.[0]) {
          return new Response(JSON.stringify(inner), { status: 200, headers: hdrs });
        }
      } catch {}
    }

    // Strategy 3: __NEXT_DATA__ (older Yahoo Finance page structure)
    const nextM = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextM) {
      try {
        const nd = JSON.parse(nextM[1]);
        const found = findDeep(nd, 'quoteSummary');
        if (found?.result?.[0]) {
          return new Response(JSON.stringify({ quoteSummary: found }), { status: 200, headers: hdrs });
        }
      } catch {}
    }

    // Strategy 4: Yahoo Finance changed to CSR — fall back to v10 API with crumb auth
    // Extract symbol from URL: /quote/AAPL/ → AAPL
    const symbol = new URL(url).pathname.split('/').filter(Boolean)[1];
    if (symbol) {
      const auth = await getYahooCrumb();
      const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents';
      for (const host of ['query1', 'query2']) {
        try {
          const sep   = auth?.crumb ? '&' : '?';
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
            if (json?.quoteSummary?.result?.[0]) {
              return new Response(JSON.stringify(json), { status: 200, headers: hdrs });
            }
          }
        } catch {}
      }
    }

    return err('quoteSummary not found');

  } catch (e) {
    return err(e.message);
  }
}

// Recursively search an object for a key with a non-null value
function findDeep(obj, key, depth = 0) {
  if (depth > 8 || obj === null || typeof obj !== 'object') return null;
  if (key in obj && obj[key] !== null) return obj[key];
  for (const v of Object.values(obj)) {
    const r = findDeep(v, key, depth + 1);
    if (r !== null) return r;
  }
  return null;
}

// ── AAII Sentiment Survey scraper ───────────────────────────────────────────
async function handleAAIIPage(origin) {
  const hdrs = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  const err  = (msg) => new Response(JSON.stringify({ error: msg }), { status: 502, headers: hdrs });
  try {
    const res = await fetch('https://www.aaii.com/sentimentsurvey', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return err(`HTTP ${res.status}`);
    const html = await res.text();
    const data = parseAAII(html);
    return new Response(JSON.stringify(data), { status: 200, headers: hdrs });
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

    if (label === 'Historical Averages') {
      result.averages = { bull, neu, bear };
    } else if (label.includes('1-Year Bullish High')) {
      result.highs.bull = { val: bull, date };
    } else if (label.includes('1-Year Neutral High')) {
      result.highs.neu  = { val: neu,  date };
    } else if (label.includes('1-Year Bearish High')) {
      result.highs.bear = { val: bear, date };
    } else if (/\d+\/\d+\/\d+/.test(label) && bull !== null) {
      result.weekly.push({ date: label, bull, neu, bear });
    }
  }
  return result;
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

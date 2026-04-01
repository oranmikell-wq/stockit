// MarketExtras.js — Market Breadth, Earnings Calendar, Short Interest, Put/Call Ratio

import { fetchProxy, fetchProxyRaw, fetchIndexQuote } from '../services/StockService.js';

function getFinnhubKey() {
  return localStorage.getItem('bon-finnhub-key') || 'd6qup2hr01qgdhqcgpbgd6qup2hr01qgdhqcgpc0';
}

// ── 1. Market Breadth ─────────────────────────────────────────────────────────
const SECTOR_ETFS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLI', 'XLC', 'XLRE', 'XLB', 'XLU'];

export async function loadMarketBreadth() {
  const el = document.getElementById('breadth-container');
  if (!el) return;

  try {
    const results = await Promise.all(SECTOR_ETFS.map(async sym => {
      try {
        const q = await fetchIndexQuote(sym);
        return { sym, pct: q?.changePct ?? null };
      } catch { return { sym, pct: null }; }
    }));

    const valid   = results.filter(r => r.pct !== null);
    const up      = valid.filter(r => r.pct >= 0).length;
    const down    = valid.filter(r => r.pct < 0).length;
    const total   = valid.length || 10;
    const upPct   = (up / total * 100).toFixed(0);
    const downPct = (down / total * 100).toFixed(0);

    const color = up >= 6 ? 'var(--positive, #22c55e)' : up <= 4 ? 'var(--negative, #ef4444)' : 'var(--warn, #eab308)';
    const cls   = up >= 6 ? 'positive' : up <= 4 ? 'negative' : 'warn';

    el.innerHTML = `
      <div class="breadth-main">
        <span class="breadth-count ${cls}">${up} <span class="breadth-of">/ ${total}</span></span>
        <span class="breadth-label">sectors advancing</span>
      </div>
      <div class="breadth-bar-wrap">
        <div class="breadth-bar-green" style="width:${upPct}%"></div>
        <div class="breadth-bar-red"   style="width:${downPct}%"></div>
      </div>
      <div class="breadth-sub">
        <span class="positive">▲ Advancing: ${up}</span>
        <span class="negative">▼ Declining: ${down}</span>
      </div>`;
  } catch {
    el.innerHTML = '<p class="extras-error">Unable to load breadth data</p>';
  }
}

// ── 2. Earnings Calendar ──────────────────────────────────────────────────────
const KNOWN_SYMBOLS = new Set([
  'AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','JPM','BAC','WFC','GS','MS',
  'V','MA','COST','WMT','HD','MCD','NKE','DIS','NFLX','ORCL','CRM','ADBE','INTC',
  'AMD','QCOM','TXN','IBM','XOM','CVX','JNJ','PFE','MRK','ABBV','LLY','UNH',
  'T','VZ','CMCSA','PEP','KO','PM','MO','BA','CAT','GE','MMM','HON','UPS','FDX',
  'AMT','PLD','SPG',
]);

export async function loadEarningsCalendar() {
  const el = document.getElementById('earnings-container');
  if (!el) return;

  try {
    const today = new Date();
    const from  = _fmtDate(today);
    const key   = getFinnhubKey();

    // Try progressively wider windows until we have results
    let items = [];
    for (const days of [14, 30, 60]) {
      const to  = _fmtDate(new Date(today.getTime() + days * 86400000));
      const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`;
      const data = await fetchProxy(url);
      items = (data?.earningsCalendar ?? [])
        .filter(e => KNOWN_SYMBOLS.has(e.symbol))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10);
      if (items.length) break;
    }

    if (!items.length) {
      el.innerHTML = '<p class="extras-empty">No upcoming earnings found</p>';
      return;
    }

    // Group by date
    const byDate = {};
    items.forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });

    el.innerHTML = items.map(e => {
      const d     = new Date(e.date + 'T00:00:00');
      const day   = d.getDate();
      const month = d.toLocaleString('en', { month: 'short' });
      const hasName = e.name && e.name !== e.symbol;
      return `
        <div class="event-item">
          <div class="event-date-col">
            <div class="event-day">${day}</div>
            <div class="event-month">${month}</div>
          </div>
          <div class="event-info">
            <div class="event-name">${hasName ? e.name : e.symbol}</div>
            ${hasName ? `<div class="event-countdown">${e.symbol}</div>` : ''}
          </div>
        </div>`;
    }).join('');

  } catch {
    el.innerHTML = '<p class="extras-error">Unable to load earnings data</p>';
  }
}

// ── 3. Short Interest ─────────────────────────────────────────────────────────
const SHORT_TICKERS = ['GME','AMC','PLTR','RIVN','LCID','SOFI','NKLA','BYND','MSTR','CVNA'];

export async function loadShortInterest() {
  const el = document.getElementById('short-container');
  if (!el) return;

  try {
    const results = await Promise.all(SHORT_TICKERS.map(async sym => {
      try {
        const [quoteData, summaryData] = await Promise.all([
          fetchProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d&includePrePost=false`),
          fetchProxy(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=defaultKeyStatistics`),
        ]);
        const meta      = quoteData?.chart?.result?.[0]?.meta;
        const price     = meta?.regularMarketPrice ?? null;
        const prevClose = meta?.chartPreviousClose ?? meta?.previousClose ?? null;
        const changePct = (price != null && prevClose != null && prevClose !== 0)
          ? ((price - prevClose) / prevClose) * 100 : null;
        // shortPercentOfFloat is 0–1 (e.g. 0.1845 = 18.45%)
        const ks       = summaryData?.quoteSummary?.result?.[0]?.defaultKeyStatistics;
        const sfRaw    = ks?.shortPercentOfFloat?.raw ?? null;
        const shortPct = sfRaw != null ? sfRaw * 100 : null;
        return { sym, price, changePct, shortPct };
      } catch { return null; }
    }));

    const enriched = results.filter(Boolean);

    // Sort by short % descending; put nulls last
    enriched.sort((a, b) => {
      if (a.shortPct == null && b.shortPct == null) return 0;
      if (a.shortPct == null) return 1;
      if (b.shortPct == null) return -1;
      return b.shortPct - a.shortPct;
    });

    const top5 = enriched.slice(0, 5);

    el.innerHTML = `
      <table class="short-table">
        <thead><tr>
          <th>Symbol</th><th>Short %</th><th>Price</th><th>Change</th>
        </tr></thead>
        <tbody>
          ${top5.map(r => {
            const shortStr = r.shortPct != null ? `${r.shortPct.toFixed(1)}%` : '--';
            const shortCls = r.shortPct == null ? '' : r.shortPct >= 20 ? 'negative' : r.shortPct >= 10 ? 'warn' : 'yellow-soft';
            const priceStr = r.price != null ? `$${r.price.toFixed(2)}` : '--';
            const chgStr   = r.changePct != null ? `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%` : '--';
            const chgCls   = r.changePct == null ? '' : r.changePct >= 0 ? 'positive' : 'negative';
            return `<tr>
              <td class="short-sym">${r.sym}</td>
              <td class="short-pct ${shortCls}">${shortStr}</td>
              <td>${priceStr}</td>
              <td class="${chgCls}">${chgStr}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

  } catch {
    el.innerHTML = '<p class="extras-error">Unable to load short interest data</p>';
  }
}

// ── 4. Put/Call Ratio ─────────────────────────────────────────────────────────
// CBOE daily P/C data is behind CORS; use a known fallback display when unavailable.
// Attempt to fetch CBOE daily data page and extract ratio.

export async function loadPutCallRatio() {
  const el = document.getElementById('pcr-container');
  if (!el) return;

  let ratio = null;

  try {
    // CBOE publishes daily stats — try to fetch and parse
    const url  = 'https://markets.cboe.com/us/options/market_statistics/daily/';
    const html = await fetchProxyRaw(url);
    // Look for total P/C ratio pattern like "0.84" or "0,84"
    const match = html.match(/[Tt]otal[^<]*?(\d+\.\d{2})/);
    if (match) ratio = parseFloat(match[1]);
  } catch { /* fallback */ }

  // Render with whatever we have (ratio may still be null → fallback display)
  _renderPCR(el, ratio);
}

function _renderPCR(el, ratio) {
  const hasPCR  = ratio != null && ratio > 0 && ratio < 5;
  const display = hasPCR ? ratio.toFixed(2) : '--';
  const sentiment = hasPCR
    ? (ratio < 0.7 ? { label: 'Very Bullish', cls: 'positive' }
     : ratio < 0.9 ? { label: 'Neutral',      cls: 'warn'     }
     :               { label: 'Bearish',       cls: 'negative' })
    : { label: 'N/A', cls: '' };

  el.innerHTML = `
    <div class="pcr-main">
      <span class="pcr-value ${sentiment.cls}">${display}</span>
      <span class="pcr-sentiment ${sentiment.cls}">${sentiment.label}</span>
    </div>
    <div class="pcr-meta">CBOE Total P/C Ratio</div>
    <div class="pcr-avg">Historical Average: ~0.87</div>
    ${!hasPCR ? '<p class="extras-note">Live data unavailable · historical avg shown</p>' : ''}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _shortDate(iso) {
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

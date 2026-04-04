// TopPicks.js — S&P 500 daily scan results as a 10-stock table
// Fetches from Cloudflare Worker KV; falls back to local scoring.
// Includes a WATCHLIST tab that replaces the separate home watchlist block.

import { t } from '../utils/i18n.js?v=6';
import { calcScore } from '../utils/scoring.js';
import { fetchAllData, fetchHistory } from '../services/StockService.js';

const WORKER_URL = 'https://bulltherapy-proxy.oranmikell.workers.dev/top-picks';
const PICKS_KEY  = 'bon-toppicks-v9';        // v9: ath = real 5Y high
const PICKS_TTL  = 4 * 60 * 60 * 1000;      // 4 hours

const FALLBACK_UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','META',
  'JPM','V','GS','JNJ','UNH',
];

// ── Local cache ───────────────────────────────────────────────────────────────
function picksFromCache() {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    if (!raw) return null;
    const { picks, ts } = JSON.parse(raw);
    if (Date.now() - ts < PICKS_TTL) return picks;
    return null;
  } catch { return null; }
}
function picksToCache(picks) {
  try { localStorage.setItem(PICKS_KEY, JSON.stringify({ picks, ts: Date.now() })); } catch {}
}

// ── Worker fetch ──────────────────────────────────────────────────────────────
async function fetchWorkerPicks() {
  const res = await fetch(WORKER_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.picks?.length) throw new Error('No picks in response');
  return json.picks.slice(0, 10);
}

// ── Local fallback ────────────────────────────────────────────────────────────
function getCachedScore(symbol) {
  try {
    const raw = localStorage.getItem(`bon-score-${symbol.toUpperCase()}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function localFallback() {
  const results = [];
  await Promise.allSettled(FALLBACK_UNIVERSE.map(async sym => {
    try {
      const cached = getCachedScore(sym);
      const { data } = await fetchAllData(sym, true);
      if (!data) return;
      if (cached) {
        results.push({ symbol: sym, name: data.name ?? sym, score: cached.score, rating: cached.rating,
          price: data.price, changePct: data.changePct, ath: data.high52w ?? null, aboveMA200: null });
        return;
      }
      const history = await fetchHistory(sym, '5Y').catch(() => []);
      const scored  = calcScore(data, history ?? [], {});
      if (scored.score == null) return;
      results.push({ symbol: sym, name: data.name ?? sym, score: scored.score, rating: scored.rating,
        price: data.price, changePct: data.changePct, ath: data.high52w ?? null, aboveMA200: null });
    } catch {}
  }));
  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

// ── Watchlist picks ───────────────────────────────────────────────────────────
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('bon-watchlist') || '[]'); }
  catch { return []; }
}

let _wlPicksCache = null; // session cache — cleared on watchlist change

async function loadWatchlistPicks() {
  if (_wlPicksCache) return _wlPicksCache;
  const list = getWatchlist();
  if (!list.length) return [];
  const results = [];
  await Promise.allSettled(list.map(async item => {
    try {
      const { data } = await fetchAllData(item.symbol, true);
      const cached   = getCachedScore(item.symbol);
      results.push({
        symbol:    item.symbol,
        name:      data?.name ?? item.name ?? item.symbol,
        score:     cached?.score ?? null,
        rating:    cached?.rating ?? item.rating ?? 'wait',
        price:     data?.price    ?? null,
        changePct: data?.changePct ?? null,
        ath:       data?.high52w  ?? null,
        marketCap: data?.marketCap ?? null,
        aboveMA200: null,
      });
    } catch {}
  }));
  _wlPicksCache = results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return _wlPicksCache;
}

// Clear session cache whenever watchlist changes (called from main.js)
export function clearWatchlistPicksCache() { _wlPicksCache = null; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPrice(p) {
  if (p == null) return '-';
  return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtMarketCap(mcM) {
  if (mcM == null || mcM <= 0) return '-';
  if (mcM >= 1_000_000) return '$' + (mcM / 1_000_000).toFixed(2) + 'T';
  if (mcM >= 1_000)     return '$' + (mcM / 1_000).toFixed(1) + 'B';
  return '$' + mcM.toFixed(0) + 'M';
}

function fmtDist(price, ath) {
  if (price == null || ath == null || ath === 0) return '-';
  const pct = ((price - ath) / ath) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
}

// ── Render single row ─────────────────────────────────────────────────────────
function renderRow(pick) {
  const badgeCls = pick.rating === 'buy' ? 'tp-badge-buy'
                 : pick.rating === 'sell' ? 'tp-badge-sell' : 'tp-badge-wait';

  const chgVal = pick.changePct;
  const chgTxt = chgVal != null ? (chgVal >= 0 ? '+' : '') + chgVal.toFixed(2) + '%' : '-';
  const chgCls = chgVal != null ? (chgVal >= 0 ? 'tp-chg-up' : 'tp-chg-down') : '';

  const distTxt = fmtDist(pick.price, pick.ath);
  const distCls = pick.price != null && pick.ath != null
    ? (pick.price >= pick.ath ? 'tp-chg-up' : 'tp-chg-down') : '';

  const maTxt = pick.aboveMA200 === true  ? '<span class="tp-ma-yes">✓</span>'
              : pick.aboveMA200 === false ? '<span class="tp-ma-no">✗</span>'
              :                            '<span class="tp-ma-na">-</span>';

  const shortName = pick.name?.length > 22
    ? pick.name.slice(0, 20) + '…' : (pick.name ?? pick.symbol);

  const scoreTxt = pick.score != null ? pick.score : '-';

  const tr = document.createElement('tr');
  tr.dataset.symbol = pick.symbol;
  tr.setAttribute('tabindex', '0');
  tr.innerHTML = `
    <td class="tp-td-sym">
      <span class="tp-sym">${pick.symbol}</span>
      <span class="tp-name">${shortName}</span>
    </td>
    <td class="tp-td-num">${fmtPrice(pick.price)}</td>
    <td class="tp-td-num">${fmtPrice(pick.ath)}</td>
    <td class="tp-td-num ${distCls}">${distTxt}</td>
    <td class="tp-td-num ${chgCls}">${chgTxt}</td>
    <td class="tp-td-num">${fmtMarketCap(pick.marketCap ?? null)}</td>
    <td class="tp-td-center">${maTxt}</td>
    <td class="tp-td-center"><span class="tp-badge ${badgeCls}">${scoreTxt}</span></td>`;

  const nav = () => { if (typeof window.navigateTo === 'function') window.navigateTo('results', pick.symbol); };
  tr.addEventListener('click', nav);
  tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(); } });
  return tr;
}

// ── Fill tbody with picks or skeleton ─────────────────────────────────────────
function showSkeleton(tbody) {
  tbody.innerHTML = [...Array(5)].map(() => `
    <tr class="tp-skel-row">
      <td colspan="8"><div class="tp-skel-line"></div></td>
    </tr>`).join('');
}

function fillTbody(picks, tbody) {
  if (!picks?.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="tp-no-data">${t('noData')}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  picks.forEach(pick => tbody.appendChild(renderRow(pick)));
}

// ── Main render ───────────────────────────────────────────────────────────────
export async function renderTopPicks(container) {
  if (!container) return;

  // Hide the separate home-watchlist-section — it's replaced by the toggle
  const hwl = document.getElementById('home-watchlist-section');
  if (hwl) hwl.style.display = 'none';

  container.innerHTML = `
    <div class="sidebar-card tp-card">
      <div class="tp-toggle">
        <button class="tp-toggle-btn active" data-tab="picks">Top Picks</button>
        <button class="tp-toggle-btn" data-tab="watchlist">★ Watchlist</button>
      </div>
      <div class="tp-table-wrap">
        <table class="tp-table">
          <thead>
            <tr>
              <th class="tp-th-sym">${t('tpColStock')}</th>
              <th>${t('tpColPrice')}</th>
              <th>${t('tpColHigh52')}</th>
              <th>${t('tpColDist')}</th>
              <th>${t('tpColChange')}</th>
              <th>${t('tpColMarketCap')}</th>
              <th class="tp-th-center">${t('tpColMa200')}</th>
              <th class="tp-th-center">${t('tpColScore')}</th>
            </tr>
          </thead>
          <tbody id="tp-tbody">
            ${[...Array(10)].map(() => `
              <tr class="tp-skel-row">
                <td colspan="8"><div class="tp-skel-line"></div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="tp-disclaimer">${t('topPicksDisclaimer')}</p>
    </div>`;

  const tbody   = container.querySelector('#tp-tbody');
  const btnPicks = container.querySelector('[data-tab="picks"]');
  const btnWl    = container.querySelector('[data-tab="watchlist"]');

  let topPicksData = null; // cache for this render

  // ── Load Top Picks ────────────────────────────────────────────────────────
  try {
    let picks = picksFromCache();
    if (!picks) {
      try {
        picks = await fetchWorkerPicks();
        if (picks?.length) picksToCache(picks);
      } catch (e) {
        console.warn('[TopPicks] Worker unavailable, local fallback:', e.message);
        picks = await localFallback();
        if (picks?.length) picksToCache(picks);
      }
    }
    topPicksData = picks;
    fillTbody(picks, tbody);
  } catch {
    tbody.innerHTML = `<tr><td colspan="8" class="tp-no-data">${t('noData')}</td></tr>`;
  }

  // ── Toggle logic ──────────────────────────────────────────────────────────
  btnPicks.addEventListener('click', () => {
    if (btnPicks.classList.contains('active')) return;
    btnPicks.classList.add('active');
    btnWl.classList.remove('active');
    fillTbody(topPicksData, tbody);
  });

  btnWl.addEventListener('click', async () => {
    if (btnWl.classList.contains('active')) return;
    btnWl.classList.add('active');
    btnPicks.classList.remove('active');

    const wl = getWatchlist();
    if (!wl.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="tp-no-data">★ ${t('watchlistEmpty')}</td></tr>`;
      return;
    }
    showSkeleton(tbody);
    const wlPicks = await loadWatchlistPicks();
    fillTbody(wlPicks, tbody);
  });
}

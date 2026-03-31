// TopPicks.js — "Top 5 by Indicator" block for the home page
// Uses scores saved by the results page (exact speedometer scores).
// Falls back to fetchAllData for stocks not yet visited.

import { t } from '../utils/i18n.js?v=5';
import { calcScore } from '../utils/scoring.js';
import { fetchAllData, fetchHistory } from '../services/StockService.js';

const UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','META',
  'JPM','V','GS',
  'JNJ','UNH','LLY',
  'KO','WMT','MCD',
  'XOM','NEE','CAT',
];

const PICKS_KEY = 'bon-toppicks-v5';
const PICKS_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

// Read score saved by the results page speedometer.
// No TTL — always prefer the exact speedometer score over a fresh skipFund recompute.
function getCachedScore(symbol) {
  try {
    const raw = localStorage.getItem(`bon-score-${symbol.toUpperCase()}`);
    if (!raw) return null;
    const { score, rating } = JSON.parse(raw);
    return { score, rating };
  } catch { return null; }
}

async function scoreUniverse() {
  const BATCH = 5;
  const results = [];

  for (let i = 0; i < UNIVERSE.length; i += BATCH) {
    const batch = UNIVERSE.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(async sym => {
      // Use exact score from results page if available
      const cached = getCachedScore(sym);
      if (cached) {
        // Still need price/name — use fetchAllData (hits 15-min cache)
        const { data } = await fetchAllData(sym, true);
        if (!data) return null;
        return { symbol: sym, name: data.name ?? sym, score: cached.score, rating: cached.rating, price: data.price, changePct: data.changePct };
      }

      // Fallback: compute from scratch with full fundamentals (stock never visited)
      const [{ data }, history] = await Promise.all([
        fetchAllData(sym, false),
        fetchHistory(sym, '5Y').catch(() => []),
      ]);
      if (!data) return null;
      const scored = calcScore(data, history ?? [], {});
      if (scored.score == null) return null;
      // Save so future loads use this consistent score (until speedometer overwrites it)
      try { localStorage.setItem(`bon-score-${sym.toUpperCase()}`, JSON.stringify({ score: scored.score, rating: scored.rating, ts: Date.now() })); } catch {}
      return { symbol: sym, name: data.name ?? sym, score: scored.score, rating: scored.rating, price: data.price, changePct: data.changePct };
    }));

    settled.forEach(res => {
      if (res.status === 'fulfilled' && res.value) results.push(res.value);
    });

    if (i + BATCH < UNIVERSE.length) await new Promise(r => setTimeout(r, 300));
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

const BADGE = {
  buy:  { cls: 'tp-badge-buy' },
  wait: { cls: 'tp-badge-wait' },
  sell: { cls: 'tp-badge-sell' },
};

function renderChip(pick) {
  const b = BADGE[pick.rating] || BADGE.wait;
  const sign = pick.changePct >= 0 ? '+' : '';
  const chg = pick.changePct != null ? `${sign}${pick.changePct.toFixed(2)}%` : '';
  const chgCls = pick.changePct >= 0 ? 'tp-chg-up' : 'tp-chg-down';
  const shortName = pick.name.length > 18 ? pick.name.slice(0, 16) + '…' : pick.name;

  const chip = document.createElement('div');
  chip.className = 'tp-chip';
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  chip.dataset.symbol = pick.symbol;

  chip.innerHTML = `
    <div class="tp-chip-top">
      <span class="tp-sym">${pick.symbol}</span>
      <span class="tp-badge ${b.cls}">${pick.score}</span>
    </div>
    <div class="tp-name">${shortName}</div>
    <div class="tp-bottom">
      <span class="tp-price">${pick.price != null ? '$' + pick.price.toLocaleString(undefined, {maximumFractionDigits: 2}) : ''}</span>
      <span class="tp-chg ${chgCls}">${chg}</span>
    </div>`;

  return chip;
}

export async function renderTopPicks(container) {
  if (!container) return;

  container.innerHTML = `
    <div class="sidebar-card tp-card">
      <h2 class="section-title card-title">${t('topPicksTitle')}</h2>
      <p class="tp-subtitle">${t('topPicksSubtitle')}</p>
      <div id="tp-list" class="tp-list">
        ${[...Array(5)].map(() => '<div class="tp-chip tp-skeleton"></div>').join('')}
      </div>
      <p class="tp-disclaimer">${t('topPicksDisclaimer')}</p>
    </div>`;

  const list = container.querySelector('#tp-list');

  try {
    let picks = picksFromCache();
    if (!picks) {
      picks = await scoreUniverse();
      if (picks.length > 0) picksToCache(picks);
    }

    if (!picks || picks.length === 0) {
      list.innerHTML = `<p class="tp-no-data">${t('noData')}</p>`;
      return;
    }

    list.innerHTML = '';
    picks.forEach(pick => {
      const chip = renderChip(pick);
      chip.addEventListener('click', () => {
        if (typeof window.navigateTo === 'function') window.navigateTo('results', pick.symbol);
      });
      chip.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (typeof window.navigateTo === 'function') window.navigateTo('results', pick.symbol);
        }
      });
      list.appendChild(chip);
    });
  } catch {
    list.innerHTML = `<p class="tp-no-data">${t('noData')}</p>`;
  }
}

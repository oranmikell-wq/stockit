// TrendingList.js — trending stocks list on home page

import { fetchStockFullData, fetchTrending, fetchAllData, fetchHistory } from '../services/StockService.js';
import { calcScore } from '../utils/scoring.js';
import { t } from '../utils/i18n.js?v=5';

const TRENDING_NAMES = {
  AAPL: 'Apple Inc.',
  TSLA: 'Tesla, Inc.',
  NVDA: 'NVIDIA Corporation',
  AMZN: 'Amazon.com, Inc.',
  MSFT: 'Microsoft Corporation',
};

let lastTrendingData = null;

export function renderTrendingList(onNavigate) {
  if (!lastTrendingData) return;
  const container = document.getElementById('trending-list');
  if (!container) return;
  container.innerHTML = lastTrendingData.map((stock, i) => {
    const changePct = stock.changePct != null ? `${stock.changePct > 0 ? '+' : ''}${stock.changePct.toFixed(1)}%` : '';
    const price = stock.price != null ? `$${Number(stock.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '';
    return `
      <div class="trending-item" data-symbol="${stock.symbol}">
        <div class="trending-left">
          <span class="trending-symbol">${stock.symbol}</span>
          <span class="trending-name">${stock.name}</span>
        </div>
        <div class="trending-right">
          ${price ? `<span class="trending-price">${price}</span>` : ''}
          <span class="trending-change ${stock.changePct != null ? (stock.changePct >= 0 ? 'hwl-change--pos' : 'hwl-change--neg') : 'hwl-change--loading'}">${changePct}</span>
        </div>
      </div>`;
  }).join('');
  container.querySelectorAll('.trending-item').forEach(el => {
    el.addEventListener('click', () => onNavigate('results', el.dataset.symbol));
  });
}

export async function loadTrending(onNavigate) {
  const container = document.getElementById('trending-list');
  if (!container) return;
  try {
    const symbols = await fetchTrending();
    lastTrendingData = [];

    // Show fallback cards immediately so user sees something
    lastTrendingData = symbols.map(sym => ({ symbol: sym, name: TRENDING_NAMES[sym] || sym, rating: null, changePct: null }));
    renderTrendingList(onNavigate);

    // Then enrich with live data one by one
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      try {
        const [fullData, { data }, history] = await Promise.all([
          fetchStockFullData(sym),
          fetchAllData(sym, true),
          fetchHistory(sym, '5Y').catch(() => []),
        ]);
        const indicators = fullData.indicators ?? {};
        const scored = calcScore(data, history ?? [], indicators);
        lastTrendingData[i] = { ...data, ...scored };
        renderTrendingList(onNavigate);
      } catch (e) {
        // keep fallback entry, continue
      }
    }
  } catch (e) {
    container.innerHTML = `<p style="padding:16px;color:var(--text-3);font-size:13px">${e.message}</p>`;
  }
}

export function getLastTrendingData() {
  return lastTrendingData;
}

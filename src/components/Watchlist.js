// Watchlist.js — watchlist + in-app alerts

import { fetchAllData, fetchHistory } from '../services/StockService.js';
import { calcScore } from '../utils/scoring.js';
import { t } from '../utils/i18n.js?v=6';

export function getWatchlist() {
  try { return JSON.parse(localStorage.getItem('bon-watchlist') || '[]'); }
  catch { return []; }
}

export function saveWatchlist(list) {
  localStorage.setItem('bon-watchlist', JSON.stringify(list));
}

export function isInWatchlist(symbol) {
  return getWatchlist().some(w => w.symbol === symbol);
}

export function addToWatchlist(symbol, name, rating, showNotif, updateBtn) {
  const list = getWatchlist();
  if (list.some(w => w.symbol === symbol)) return;
  list.push({ symbol, name, rating, addedAt: Date.now() });
  saveWatchlist(list);
  if (showNotif) showNotif(t('watchlistAdded'));
  if (updateBtn) updateBtn(symbol);
}

export function removeFromWatchlist(symbol, showNotif, updateBtn, renderWL) {
  const list = getWatchlist().filter(w => w.symbol !== symbol);
  saveWatchlist(list);
  if (showNotif) showNotif(t('watchlistRemoved'));
  if (updateBtn) updateBtn(symbol);
  if (document.getElementById('page-watchlist')?.classList.contains('active')) {
    if (renderWL) renderWL();
  }
}

export function toggleWatchlist(symbol, name, rating, showNotif, updateBtn, renderWL) {
  if (isInWatchlist(symbol)) removeFromWatchlist(symbol, showNotif, updateBtn, renderWL);
  else addToWatchlist(symbol, name, rating, showNotif, updateBtn);
}

export function updateWatchlistBtn(symbol) {
  const btn = document.getElementById('btn-watchlist-toggle');
  if (!btn) return;
  const inWL = isInWatchlist(symbol);
  btn.textContent = inWL ? '★' : '☆';
  btn.style.color = inWL ? '#ca8a04' : '';
  btn.title = t(inWL ? 'btnRemoveWatchlist' : 'btnWatchlist');
}

export async function checkWatchlistAlerts(showNotif) {
  const list = getWatchlist();
  if (!list.length) return;
  for (const item of list) {
    try {
      const { data } = await fetchAllData(item.symbol);
      const h5 = await fetchHistory(item.symbol, '5Y');
      const result = calcScore(data, h5);
      if (result.rating !== item.rating) {
        const oldLabel = t(item.rating === 'buy' ? 'buy' : item.rating === 'wait' ? 'wait' : 'sell');
        const newLabel = t(result.rating === 'buy' ? 'buy' : result.rating === 'wait' ? 'wait' : 'sell');
        if (showNotif) showNotif(t('ratingChanged', { symbol: item.symbol, old: oldLabel, new: newLabel }));
        item.rating = result.rating;
      }
    } catch {}
  }
  saveWatchlist(list);
}

export function renderWatchlist(onNavigate, showNotif) {
  const container = document.getElementById('watchlist-content');
  if (!container) return;
  const list = getWatchlist();

  if (!list.length) {
    container.innerHTML = `<div class="watchlist-empty">${t('watchlistEmpty')}</div>`;
    return;
  }

  container.innerHTML = `<div class="watchlist-list">${
    list.map(item => {
      const ratingKey = item.rating === 'buy' ? 'buy' : item.rating === 'wait' ? 'wait' : 'sell';
      const badgeClass = item.rating === 'buy' ? 'badge-buy-bg' : item.rating === 'wait' ? 'badge-wait-bg' : 'badge-sell-bg';
      return `
        <div class="watchlist-item" data-symbol="${item.symbol}">
          <span class="wl-symbol">${item.symbol}</span>
          <span class="wl-name">${item.name || ''}</span>
          <span class="wl-badge ${badgeClass}">${t(ratingKey)}</span>
          <button class="wl-remove" data-symbol="${item.symbol}" onclick="window.removeFromWatchlist('${item.symbol}');event.stopPropagation()">✕</button>
        </div>`;
    }).join('')
  }</div>`;

  container.querySelectorAll('.watchlist-item').forEach(el => {
    el.addEventListener('click', () => { if (onNavigate) onNavigate('results', el.dataset.symbol); });
  });
}

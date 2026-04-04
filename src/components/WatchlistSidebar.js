// WatchlistSidebar.js — slide-in watchlist panel with mini sparkline charts

import { fetchAllData, fetchHistory } from '../services/StockService.js';
import { getWatchlist, removeFromWatchlist, isInWatchlist } from './Watchlist.js';
import { t } from '../utils/i18n.js?v=6';

let _onNavigate = null;
let _showNotification = null;
let _updateWatchlistBtn = null;
let _renderWatchlistPage = null;

// ── Sparkline builder ────────────────────────────────────

function buildSparkline(prices, width = 80, height = 32) {
  if (!prices || prices.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none"></svg>`;
  }
  const vals = prices.map(p => (p.value != null ? p.value : p));
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;

  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isUp  = vals[vals.length - 1] >= vals[0];
  const color = isUp ? '#16a34a' : '#dc2626';
  const fillColor = isUp ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)';

  // Build fill polygon: close path along bottom
  const fillPts = [...pts, `${width},${height}`, `0,${height}`].join(' ');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${fillPts}" fill="${fillColor}"/>
    <polyline points="${pts.join(' ')}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// ── Sidebar count badge ──────────────────────────────────

export function updateSidebarCount() {
  const badge = document.getElementById('wl-count-badge');
  if (!badge) return;
  const count = getWatchlist().length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// ── Open / Close ─────────────────────────────────────────

export function openWatchlistSidebar() {
  document.getElementById('wl-sidebar')?.classList.add('open');
  document.getElementById('wl-sidebar-overlay')?.classList.add('open');
  renderWatchlistSidebar();
}

export function closeWatchlistSidebar() {
  document.getElementById('wl-sidebar')?.classList.remove('open');
  document.getElementById('wl-sidebar-overlay')?.classList.remove('open');
}

// ── Render ───────────────────────────────────────────────

export async function renderWatchlistSidebar() {
  const body = document.getElementById('wl-sidebar-body');
  if (!body) return;

  const list = getWatchlist();

  if (!list.length) {
    body.innerHTML = `
      <div class="wl-sidebar-empty">
        <span class="wl-sidebar-empty-icon">☆</span>
        <p>${t('watchlistEmptyState').replace('\n', '<br>')}</p>
      </div>`;
    return;
  }

  // Skeleton while loading
  body.innerHTML = list.map(() => `
    <div class="wl-skel-item">
      <div class="wl-skel-row">
        <div class="wl-skel-block wl-skel-sym"></div>
        <div class="wl-skel-block wl-skel-badge"></div>
      </div>
      <div class="wl-skel-row">
        <div class="wl-skel-block wl-skel-price"></div>
        <div class="wl-skel-block wl-skel-spark"></div>
      </div>
    </div>`).join('');

  // Fetch all in parallel
  const results = await Promise.all(list.map(async item => {
    try {
      const [{ data }, history] = await Promise.all([
        fetchAllData(item.symbol),
        fetchHistory(item.symbol, '1M').catch(() => []),
      ]);
      return { item, data, history };
    } catch {
      return { item, data: null, history: [] };
    }
  }));

  body.innerHTML = results.map(({ item, data, history }) => {
    const price     = data?.price;
    const changePct = data?.changePct;
    const currency  = data?.currency || '';

    const badgeClass = item.rating === 'buy' ? 'badge-buy-bg' : item.rating === 'wait' ? 'badge-wait-bg' : 'badge-sell-bg';
    const badgeText  = t(item.rating === 'buy' ? 'buy' : item.rating === 'wait' ? 'wait' : 'sell');

    const priceStr  = price != null
      ? `${currency} ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim()
      : '—';
    const changeStr = changePct != null
      ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
      : '';
    const changeClass = changePct != null ? (changePct >= 0 ? 'positive' : 'negative') : '';

    const sparkline = buildSparkline(history);

    return `
      <div class="wl-sidebar-item" data-symbol="${item.symbol}">
        <div class="wl-item-header">
          <div class="wl-item-meta">
            <span class="wl-item-symbol">${item.symbol}</span>
            <span class="wl-item-name">${item.name || ''}</span>
          </div>
          <div class="wl-item-actions">
            <span class="wl-badge ${badgeClass}">${badgeText}</span>
            <button class="wl-item-remove" data-symbol="${item.symbol}" title="Remove from watchlist">✕</button>
          </div>
        </div>
        <div class="wl-item-footer">
          <div class="wl-item-prices">
            <span class="wl-item-price">${priceStr}</span>
            ${changeStr ? `<span class="wl-item-change ${changeClass}">${changeStr}</span>` : ''}
          </div>
          <div class="wl-item-spark">${sparkline}</div>
        </div>
      </div>`;
  }).join('');

  // Click item → navigate to results
  body.querySelectorAll('.wl-sidebar-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.wl-item-remove')) return;
      closeWatchlistSidebar();
      if (_onNavigate) _onNavigate('results', el.dataset.symbol);
    });
  });

  // Remove buttons
  body.querySelectorAll('.wl-item-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const symbol = btn.dataset.symbol;
      removeFromWatchlist(symbol, _showNotification, _updateWatchlistBtn, _renderWatchlistPage);
      // Re-render the sidebar after removal
      renderWatchlistSidebar();
      updateSidebarCount();
    });
  });
}

// ── Init ─────────────────────────────────────────────────

export function initWatchlistSidebar(onNavigate, showNotification, updateWatchlistBtn, renderWatchlistPage) {
  _onNavigate         = onNavigate;
  _showNotification   = showNotification;
  _updateWatchlistBtn = updateWatchlistBtn;
  _renderWatchlistPage = renderWatchlistPage;
}

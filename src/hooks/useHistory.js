// useHistory.js — search history management

import { t } from '../utils/i18n.js?v=6';

export function getHistory() {
  try { return JSON.parse(localStorage.getItem('bon-history') || '[]'); }
  catch { return []; }
}

export function saveSearchHistory(symbol, name, renderHistoryFn) {
  let hist = getHistory().filter(h => h.symbol !== symbol);
  hist.unshift({ symbol, name });
  hist = hist.slice(0, 10);
  localStorage.setItem('bon-history', JSON.stringify(hist));
  if (renderHistoryFn) renderHistoryFn();
}

export function renderHistory(onNavigate) {
  const hist = getHistory();
  const section = document.getElementById('history-section');
  const container = document.getElementById('history-list');
  if (!section || !container) return;
  if (!hist.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  container.innerHTML = hist.map(h => `
    <div class="history-item" data-symbol="${h.symbol}">
      <span>${h.symbol}</span>
      <button class="history-remove" onclick="window.removeHistory('${h.symbol}');event.stopPropagation()">✕</button>
    </div>`).join('');
  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => { if (onNavigate) onNavigate('results', el.dataset.symbol); });
  });
}

export function removeHistory(symbol, renderHistoryFn) {
  const hist = getHistory().filter(h => h.symbol !== symbol);
  localStorage.setItem('bon-history', JSON.stringify(hist));
  if (renderHistoryFn) renderHistoryFn();
}

// QuickScore.js — 4-metric quick-score widget with weights

import { t } from '../utils/i18n.js?v=6';
import { calcSMA } from '../services/StockService.js';
import { initInfoButtons } from './InfoPopup.js';

// RSI raw value → 0-100 health score
function rsiToScore(rsi) {
  if (rsi == null) return null;
  if (rsi < 30)  return 65; // oversold — potential bounce
  if (rsi < 40)  return 55;
  if (rsi < 65)  return 80; // ideal momentum zone
  if (rsi < 75)  return 40; // getting overbought
  return 20;                 // overbought
}

// MA150 + MA200 position → 0-100 score
function maToScore(closes, price) {
  if (!closes?.length || price == null) return null;
  const ma150 = calcSMA(closes, 150);
  const ma200 = calcSMA(closes, 200);
  const a150 = ma150 != null ? price > ma150 : null;
  const a200 = ma200 != null ? price > ma200 : null;
  if (a150 === null && a200 === null) return null;
  if (a150 && a200)   return 88; // above both = strong uptrend
  if (a200 && !a150)  return 60; // above MA200, below MA150
  if (a150 && !a200)  return 45; // above MA150, below MA200 (recovering)
  return 18;                     // below both = downtrend
}

function scoreColor(s) {
  return s >= 66 ? 'var(--green)' : s >= 41 ? 'var(--yellow)' : 'var(--red)';
}
function scoreCls(s) {
  return s == null ? '' : s >= 66 ? 'qs-high' : s >= 41 ? 'qs-mid' : 'qs-low';
}

export function renderQuickScore(container, scored, closes, price) {
  if (!container) return;

  const metrics = [
    { labelKey: 'qs_rsi',       weight: 0.20, score: rsiToScore(scored?.technicals?.rsi), infoKey: 'crit_technical' },
    { labelKey: 'qs_ma',        weight: 0.30, score: maToScore(closes, price),             infoKey: 'sc_ma200'       },
    { labelKey: 'qs_valuation', weight: 0.25, score: scored?.criteria?.multiples ?? null,  infoKey: 'crit_multiples' },
    { labelKey: 'qs_rs',        weight: 0.25, score: scored?.criteria?.momentum  ?? null,  infoKey: 'crit_momentum'  },
  ];

  // Weighted total — only metrics with data
  const valid  = metrics.filter(m => m.score != null);
  const totalW = valid.reduce((s, m) => s + m.weight, 0);
  const total  = totalW > 0
    ? Math.round(valid.reduce((s, m) => s + m.score * m.weight, 0) / totalW)
    : null;

  container.innerHTML = `
    <div class="qs-wrap">
      ${metrics.map(m => `
        <div class="qs-row">
          <div class="qs-meta">
            <span class="qs-name">${t(m.labelKey)}</span>
            <button class="info-icon-btn" data-info="${m.infoKey}">i</button>
            <span class="qs-weight">${Math.round(m.weight * 100)}%</span>
          </div>
          <div class="qs-bar-track">
            <div class="qs-bar-fill" style="width:${m.score ?? 0}%;background:${m.score != null ? scoreColor(m.score) : 'var(--border)'}"></div>
          </div>
          <span class="qs-score ${scoreCls(m.score)}">${m.score != null ? Math.round(m.score) : '--'}</span>
        </div>`).join('')}
      ${total != null ? `
        <div class="qs-total-row">
          <span class="qs-total-label">${t('qs_total')}</span>
          <span class="qs-total-score ${scoreCls(total)}">${total}</span>
        </div>` : ''}
    </div>`;

  initInfoButtons(container);
}

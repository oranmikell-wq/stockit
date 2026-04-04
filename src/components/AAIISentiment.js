// AAIISentiment.js — AAII Investor Sentiment Survey (stacked bar chart)

import { t } from '../utils/i18n.js?v=6';
import { fetchProxy } from '../services/StockService.js';

const AAII_URL = 'https://www.aaii.com/sentimentsurvey';

async function fetchAAII() {
  const data = await fetchProxy(AAII_URL);
  if (data.error) throw new Error(data.error);
  if (!data.weekly?.length) throw new Error('no_data');
  return data;
}

// Stacked bar (3 colors, bull+neu+bear ≈ 100)
function stackedBar(bull, neu, bear) {
  const sum = (bull || 0) + (neu || 0) + (bear || 0) || 100;
  const b = +(bull / sum * 100).toFixed(1);
  const n = +(neu  / sum * 100).toFixed(1);
  const r = +(100  - b - n).toFixed(1);
  return `
    <div class="aaii-bar">
      <div class="aaii-seg aaii-seg--bull" style="flex:0 0 ${b}%">
        <span class="aaii-seg-txt">${b}%</span>
      </div>
      <div class="aaii-seg aaii-seg--neu" style="flex:0 0 ${n}%">
        <span class="aaii-seg-txt">${n}%</span>
      </div>
      <div class="aaii-seg aaii-seg--bear" style="flex:0 0 ${r}%">
        <span class="aaii-seg-txt">${r}%</span>
      </div>
    </div>`;
}

// Single-color bar (for highs)
function singleBar(val, mod, dateStr) {
  if (val == null) return '';
  return `
    <div class="aaii-bar aaii-bar--single">
      <div class="aaii-seg ${mod}" style="flex:0 0 ${val.toFixed(1)}%;border-radius:4px">
        <span class="aaii-seg-txt">${val.toFixed(1)}%</span>
      </div>
      ${dateStr ? `<span class="aaii-bar-annot">${t('aaii_week_ending')} ${dateStr}</span>` : ''}
    </div>`;
}

function row(label, barHTML, bold = false) {
  return `
    <div class="aaii-row">
      <div class="aaii-row-label${bold ? ' aaii-row-label--bold' : ''}">${label}</div>
      <div class="aaii-row-bar">${barHTML}</div>
    </div>`;
}

// ── Public ─────────────────────────────────────────────
export async function loadAAII() {
  const el = document.getElementById('aaii-container');
  if (!el) return;

  try {
    const { weekly, averages, highs } = await fetchAAII();

    const recent = weekly.slice(0, 4);

    el.innerHTML = `
      <div class="aaii-legend">
        <span class="aaii-legend-item">
          <span class="aaii-dot aaii-seg--bull"></span>${t('aaii_bullish')}
        </span>
        <span class="aaii-legend-item">
          <span class="aaii-dot aaii-seg--neu"></span>${t('aaii_neutral')}
        </span>
        <span class="aaii-legend-item">
          <span class="aaii-dot aaii-seg--bear"></span>${t('aaii_bearish')}
        </span>
      </div>

      <p class="aaii-section-title">${t('aaii_sentiment_votes')}</p>
      ${recent.map(r => row(r.date, stackedBar(r.bull, r.neu, r.bear))).join('')}

      ${averages || highs?.bull ? `
        <p class="aaii-section-title aaii-section-title--gap">${t('aaii_historical')}</p>
        ${averages ? row(t('aaii_avg'), stackedBar(averages.bull, averages.neu, averages.bear), true) : ''}
        ${highs?.bull ? row(t('aaii_bull_high'), singleBar(highs.bull.val, 'aaii-seg--bull', highs.bull.date)) : ''}
        ${highs?.neu  ? row(t('aaii_neu_high'),  singleBar(highs.neu.val,  'aaii-seg--neu',  highs.neu.date))  : ''}
        ${highs?.bear ? row(t('aaii_bear_high'), singleBar(highs.bear.val, 'aaii-seg--bear', highs.bear.date)) : ''}
      ` : ''}

      <p class="aaii-source">${t('aaii_source')}</p>`;

  } catch (e) {
    el.innerHTML = `<p class="aaii-error">${t('aaii_error')}</p>`;
  }
}

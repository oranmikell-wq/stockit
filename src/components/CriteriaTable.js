// CriteriaTable.js — renders the 5-indicator criteria breakdown table

import { t, getCurrentLang } from '../utils/i18n.js?v=7';
import { initInfoButtons } from './InfoPopup.js';

function fmtPct(val, decimals = 1) {
  if (val == null) return null;
  const clamped = Math.max(-500, Math.min(500, val * 100));
  return `${clamped >= 0 ? '+' : ''}${clamped.toFixed(decimals)}%`;
}

function fmtNum(val, decimals = 1) {
  if (val == null) return null;
  return parseFloat(val).toFixed(decimals);
}

// ── Contextual interpretation per indicator ──────────────
function buildContext(key, score, data) {
  const isHe = getCurrentLang() === 'he';

  if (key === 'epsGrowth') {
    const pct = fmtPct(data.epsGrowthFwd);
    if (pct == null) return null;
    if (score >= 66) return isHe ? `צומח ב-${pct} — צמיחה חזקה` : `${pct} growth — strong`;
    if (score >= 41) return isHe ? `צומח ב-${pct} — צמיחה בינונית` : `${pct} growth — moderate`;
    if (data.epsGrowthFwd < 0) return isHe ? `יורד ב-${fmtPct(data.epsGrowthFwd)} — רווחים מתכווצים` : `${pct} — earnings shrinking`;
    return isHe ? `צומח ב-${pct} — צמיחה חלשה` : `${pct} growth — weak`;
  }

  if (key === 'forwardPE') {
    const pe = fmtNum(data.forwardPE);
    if (pe == null) return null;
    if (score >= 66) return isHe ? `מכפיל ${pe} — זול ביחס לסקטור` : `P/E ${pe} — cheap vs sector`;
    if (score >= 41) return isHe ? `מכפיל ${pe} — הערכה סבירה` : `P/E ${pe} — fair valuation`;
    return isHe ? `מכפיל ${pe} — יקר ביחס לסקטור` : `P/E ${pe} — expensive vs sector`;
  }

  if (key === 'fcfYield') {
    const pct = fmtPct(data.fcfYield);
    if (pct == null) return null;
    if (data.fcfYield < 0) return isHe ? `תזרים שלילי — ${pct}` : `Negative FCF — ${pct}`;
    if (score >= 66) return isHe ? `תשואת FCF ${pct} — מייצרת מזומן חזק` : `${pct} FCF yield — strong cash`;
    if (score >= 41) return isHe ? `תשואת FCF ${pct} — בריאה` : `${pct} FCF yield — healthy`;
    return isHe ? `תשואת FCF ${pct} — נמוכה` : `${pct} FCF yield — low`;
  }

  if (key === 'debtEquity') {
    const de = data.debtToEquity != null ? fmtNum(data.debtToEquity, 2) : null;
    if (de == null) return null;
    if (score >= 66) return isHe ? `חוב/הון ${de} — חוב נמוך מאוד` : `D/E ${de} — very low debt`;
    if (score >= 41) return isHe ? `חוב/הון ${de} — חוב סביר` : `D/E ${de} — manageable debt`;
    return isHe ? `חוב/הון ${de} — חוב גבוה` : `D/E ${de} — high debt`;
  }

  if (key === 'rsi') {
    const rsi = data.rsi != null ? Math.round(data.rsi) : null;
    if (rsi == null) return null;
    if (rsi > 70) return isHe ? `RSI ${rsi} — קנוי יתר` : `RSI ${rsi} — overbought`;
    if (rsi < 30) return isHe ? `RSI ${rsi} — מכור יתר` : `RSI ${rsi} — oversold`;
    return isHe ? `RSI ${rsi} — מומנטום תקין` : `RSI ${rsi} — neutral momentum`;
  }

  return null;
}

export function renderCriteriaTable(scored, data) {
  const container = document.getElementById('criteria-table');
  if (!container) return;

  const CRITERIA = [
    { key: 'epsGrowth',  labelKey: 'criteriaFwdEpsGrowth', infoKey: 'crit_epsGrowth'  },
    { key: 'forwardPE',  labelKey: 'criteriaForwardPE',     infoKey: 'crit_forwardPE'  },
    { key: 'fcfYield',   labelKey: 'criteriaFCFYield',      infoKey: 'crit_fcfYield'   },
    { key: 'debtEquity', labelKey: 'criteriaDebtEquity',    infoKey: 'crit_debtEquity' },
    { key: 'rsi',        labelKey: 'criteriaRSI',           infoKey: 'crit_rsi'        },
  ];

  container.innerHTML = CRITERIA.map(c => {
    const score    = scored.criteria?.[c.key];
    const hasData  = score != null;
    const scoreDisplay = hasData ? Math.round(score) : t('noData');
    const badgeClass   = !hasData ? 'score-none' : score >= 66 ? 'score-high' : score >= 41 ? 'score-mid' : 'score-low';
    const barColor     = !hasData ? 'var(--border)' : score >= 66 ? 'var(--green)' : score >= 41 ? 'var(--yellow)' : 'var(--red)';
    const context      = buildContext(c.key, score, data);

    return `
      <div class="criteria-row">
        <div class="criteria-row-header">
          <span class="criteria-name">${t(c.labelKey)}</span>
          <button class="info-icon-btn" data-info="${c.infoKey}" aria-label="info">i</button>
          <span class="criteria-context">${context ?? ''}</span>
          <span class="criteria-score-badge ${badgeClass}">${scoreDisplay}</span>
        </div>
        <div class="criteria-bar-wrap">
          <div class="criteria-bar" style="width:${hasData ? score : 0}%;background:${barColor}"></div>
        </div>
      </div>`;
  }).join('');

  initInfoButtons(container);
}

// CriteriaTable.js — renders the 5-indicator criteria breakdown table

import { t } from '../utils/i18n.js?v=6';

function fmtPct(val, decimals = 1) {
  if (val == null) return t('noData');
  const clamped = Math.max(-500, Math.min(500, val * 100));
  return `${clamped.toFixed(decimals)}%`;
}

function fmtNum(val, decimals = 1) {
  if (val == null) return t('noData');
  return parseFloat(val).toFixed(decimals);
}

export function renderCriteriaTable(scored, data) {
  const container = document.getElementById('criteria-table');
  if (!container) return;

  // `scored.criteria` has keys: epsGrowth, forwardPE, fcfYield, debtEquity, rsi
  // `data` carries raw values: epsGrowthFwd, forwardPE, fcfYield, debtToEquity, rsi

  const CRITERIA = [
    {
      key: 'epsGrowth',
      labelKey: 'criteriaFwdEpsGrowth',
      descKey: 'criteriaFwdEpsGrowth_desc',
      rawData: () => data.epsGrowthFwd != null ? [`${fmtPct(data.epsGrowthFwd)}`] : [],
    },
    {
      key: 'forwardPE',
      labelKey: 'criteriaForwardPE',
      descKey: 'criteriaForwardPE_desc',
      rawData: () => data.forwardPE != null ? [`P/E: ${fmtNum(data.forwardPE)}`] : [],
    },
    {
      key: 'fcfYield',
      labelKey: 'criteriaFCFYield',
      descKey: 'criteriaFCFYield_desc',
      rawData: () => data.fcfYield != null ? [`${fmtPct(data.fcfYield)}`] : [],
    },
    {
      key: 'debtEquity',
      labelKey: 'criteriaDebtEquity',
      descKey: 'criteriaDebtEquity_desc',
      rawData: () => data.debtToEquity != null ? [`D/E: ${fmtNum(data.debtToEquity / 100, 2)}`] : [],
    },
    {
      key: 'rsi',
      labelKey: 'criteriaRSI',
      descKey: 'criteriaRSI_desc',
      rawData: () => data.rsi != null ? [`RSI: ${fmtNum(data.rsi, 1)}`] : [],
    },
  ];

  container.innerHTML = CRITERIA.map(c => {
    const score = scored.criteria?.[c.key];
    const hasData = score != null;
    const scoreDisplay = hasData ? Math.round(score) : t('noData');
    const badgeClass = !hasData ? 'score-none' : score >= 66 ? 'score-high' : score >= 41 ? 'score-mid' : 'score-low';
    const barColor   = !hasData ? 'var(--border)' : score >= 66 ? 'var(--green)' : score >= 41 ? 'var(--yellow)' : 'var(--red)';
    const rawItems   = c.rawData();

    return `
      <div class="criteria-row" onclick="this.classList.toggle('expanded')">
        <div class="criteria-row-header">
          <span class="criteria-name">${t(c.labelKey)}</span>
          <button class="info-icon-btn" data-info="crit_${c.key}" onclick="event.stopPropagation()" aria-label="info">i</button>
          <span class="criteria-score-badge ${badgeClass}">${scoreDisplay}</span>
        </div>
        <div class="criteria-bar-wrap">
          <div class="criteria-bar" style="width:${hasData ? score : 0}%;background:${barColor}"></div>
        </div>
        <div class="criteria-desc">
          <p>${t(c.descKey)}</p>
          ${rawItems.length ? `<div class="criteria-data">${rawItems.map(r => `<span class="criteria-data-item">${r}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

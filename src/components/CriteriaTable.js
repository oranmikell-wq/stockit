// CriteriaTable.js — renders the detailed criteria breakdown table

import { t } from '../utils/i18n.js?v=6';

// Format growth %, capping extreme values from near-zero base effects
function fmtGrowth(pct) {
  if (pct > 500)  return `>500% (low base)`;
  if (pct < -100) return `<-100%`;
  return `${pct.toFixed(1)}%`;
}

export function renderCriteriaTable(scored, data) {
  const container = document.getElementById('criteria-table');
  if (!container) return;

  const CRITERIA = [
    { key: 'eps',           rawData: () => data.epsGrowth != null ? [`${t('criteriaEpsGrowthLabel')}: ${fmtGrowth(data.epsGrowth)}`] : [] },
    { key: 'multiples',     rawData: () => [
        data.pe != null ? (data.pe > 0 ? `P/E: ${data.pe.toFixed(1)}` : 'P/E: N/A') : null,
        data.pb && data.pb > 0 ? `P/B: ${data.pb.toFixed(1)}` : null,
        data.ps && data.ps > 0 ? `P/S: ${data.ps.toFixed(1)}` : null,
      ].filter(Boolean) },
    { key: 'revenue',       rawData: () => data.revenueGrowth != null ? [`${t('criteriaRevenueGrowthLabel')}: ${fmtGrowth(data.revenueGrowth)}`] : [] },
    { key: 'analysts',      rawData: () => {
        if (data.analystMean != null) {
          const labelKeys = ['', 'analystStrongBuy', 'analystBuy', 'analystHold', 'analystUnderperform', 'analystSell'];
          const labelKey = labelKeys[Math.round(data.analystMean)];
          const label = labelKey ? t(labelKey) : '';
          const countStr = data.analystCount ? ` (${data.analystCount})` : '';
          return [`Mean: ${data.analystMean.toFixed(1)} — ${label}${countStr}`];
        }
        if (data.analystScore) {
          return [`${t('analystBuy')}: ${data.analystScore.buy + data.analystScore.strongBuy}`, `${t('analystHold')}: ${data.analystScore.hold}`, `${t('analystSell')}: ${data.analystScore.sell}`];
        }
        return [];
      }},
    { key: 'momentum',      rawData: () => [data.changePct != null && `${t('criteriaDailyChange')}: ${data.changePct.toFixed(2)}%`, data.high52w && `${t('criteria52wHigh')}: ${data.high52w.toFixed(2)}`].filter(Boolean) },
    { key: 'institutional', rawData: () => data.instPct != null ? [`Holdings: ${(data.instPct * 100).toFixed(1)}%`] : [] },
    { key: 'debt',          rawData: () => data.debtEquity != null ? [`D/E: ${data.debtEquity.toFixed(2)}`] : [] },
    { key: 'technical',     rawData: () => [scored.technicals?.rsi != null && `RSI: ${scored.technicals.rsi.toFixed(1)}`, scored.technicals?.macd != null && `MACD: ${scored.technicals.macd.toFixed(2)}`].filter(Boolean) },
  ];

  container.innerHTML = CRITERIA.map(c => {
    const score = scored.criteria[c.key];
    const hasData = score != null;
    const scoreDisplay = hasData ? Math.round(score) : t('noData');
    const badgeClass = !hasData ? 'score-none' : score >= 66 ? 'score-high' : score >= 41 ? 'score-mid' : 'score-low';
    const barColor   = !hasData ? 'var(--border)' : score >= 66 ? 'var(--green)' : score >= 41 ? 'var(--yellow)' : 'var(--red)';
    const rawItems   = c.rawData();

    return `
      <div class="criteria-row" onclick="this.classList.toggle('expanded')">
        <div class="criteria-row-header">
          <span class="criteria-name">${t('criteria_' + c.key)}</span>
          <button class="info-icon-btn" data-info="crit_${c.key}" onclick="event.stopPropagation()" aria-label="info">i</button>
          <span class="criteria-score-badge ${badgeClass}">${scoreDisplay}</span>
        </div>
        <div class="criteria-bar-wrap">
          <div class="criteria-bar" style="width:${hasData ? score : 0}%;background:${barColor}"></div>
        </div>
        <div class="criteria-desc">
          <p>${t('criteria_' + c.key + '_desc')}</p>
          ${rawItems.length ? `<div class="criteria-data">${rawItems.map(r => `<span class="criteria-data-item">${r}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

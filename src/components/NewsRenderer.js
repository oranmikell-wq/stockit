// NewsRenderer.js — renders latest news + AI Insight card

import { t } from '../utils/i18n.js?v=5';
import { getAINewsInsight, hasGeminiKey, setGeminiKey } from '../services/AIService.js';

// ── Standard news list ───────────────────────────────────

export function renderNews(items) {
  const container = document.getElementById('news-list');
  if (!container) return;
  if (!items || !items.length) {
    container.innerHTML = `<p style="color:var(--text-3);font-size:13px">${t('noData')}</p>`;
    return;
  }
  container.innerHTML = items.map(n => `
    <a class="news-item" href="${n.url}" target="_blank" rel="noopener">
      ${n.image ? `<img class="news-thumb" src="${n.image}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="news-body">
        <div class="news-headline">${n.headline}</div>
        <div class="news-meta">${n.source} · ${new Date(n.datetime).toLocaleDateString()}</div>
      </div>
    </a>`).join('');
}

// ── AI Insight card ──────────────────────────────────────

/**
 * Render the AI Insight card above the news list.
 * Shows a setup prompt if no key is set, a skeleton while loading,
 * and the 3-bullet summary when ready.
 * Silently hides on any error.
 *
 * @param {Array}  newsItems  - same array passed to renderNews
 * @param {string} symbol     - stock ticker (for context)
 */
export async function renderAIInsight(newsItems, symbol = '', isCurrent = () => true) {
  const section = document.getElementById('ai-insight-section');
  const body    = document.getElementById('ai-insight-body');
  if (!section || !body) return;

  // ── No key yet: show setup prompt ──
  if (!hasGeminiKey()) {
    section.classList.remove('hidden');
    body.innerHTML = `
      <div class="ai-setup">
        <p class="ai-setup-text">
          ${t('aiKeyPrompt')} <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" class="ai-setup-link">Google Gemini API</a>
          ${t('aiKeyPrompt2')}
        </p>
        <div class="ai-key-row">
          <input
            id="ai-key-input"
            type="password"
            class="ai-key-input"
            placeholder="AIza…"
            autocomplete="off"
            spellcheck="false"
          />
          <button id="ai-key-save" class="ai-key-btn">${t('aiSaveKey')}</button>
        </div>
        <p class="ai-key-note">${t('aiKeyNote')}</p>
      </div>`;

    document.getElementById('ai-key-save')?.addEventListener('click', async () => {
      const val = (document.getElementById('ai-key-input')?.value || '').trim();
      if (!val) return;
      setGeminiKey(val);
      // Re-run with the key now set
      await renderAIInsight(newsItems, symbol);
    });
    return;
  }

  // ── Key exists: show skeleton while fetching ──
  if (!newsItems?.length) { section.classList.add('hidden'); return; }

  section.classList.remove('hidden');
  body.innerHTML = `
    <div class="ai-skeleton">
      <div class="ai-sk-line ai-sk-long"></div>
      <div class="ai-sk-line ai-sk-medium"></div>
      <div class="ai-sk-line ai-sk-short"></div>
    </div>`;

  const bullets = await getAINewsInsight(newsItems);

  if (!isCurrent()) return; // user navigated away while AI was fetching

  if (!bullets?.length) {
    // Graceful hide — API failure or rate limit
    section.classList.add('hidden');
    return;
  }

  body.innerHTML = `
    <ul class="ai-bullets">
      ${bullets.map(b => `
        <li class="ai-bullet">
          <span class="ai-bullet-arrow">▸</span>
          <span class="ai-bullet-text">${b}</span>
        </li>`).join('')}
    </ul>
    <div class="ai-footer">
      <span class="ai-powered">${t('aiPoweredBy')}</span>
      <button class="ai-clear-key" id="ai-clear-key-btn">${t('aiRemoveKey')}</button>
    </div>`;

  document.getElementById('ai-clear-key-btn')?.addEventListener('click', () => {
    setGeminiKey('');
    section.classList.add('hidden');
  });
}

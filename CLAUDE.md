# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**buyornot** — אפליקציית ניתוח מניות דו-לשונית (עברית/אנגלית) המיועדת לאנשים ללא ידע בשוק ההון.
המשתמש מחפש מניה, המערכת מנתחת אותה לפי קריטריונים מקצועיים ומייצרת אינדיקטור: 🔴 אל תקנה / 🟡 המתן / 🟢 קנה.

**Deploy:** GitHub Pages — `oranmikell-wq.github.io/buyornot`

## Tech Stack

- מבנה מרובה קבצים — ללא build system, ללא npm
- Vanilla JS + CSS
- localStorage לאחסון (watchlist, היסטוריית חיפושים, cache)
- GitHub Pages לדפלוי

## מבנה קבצים

```
buyornot/
├── index.html          # מבנה HTML בלבד
├── css/
│   ├── main.css        # עיצוב כללי, משתני צבע, light/dark
│   ├── home.css        # דף הבית
│   ├── results.css     # דף תוצאות
│   └── compare.css     # דף השוואה
└── js/
    ├── app.js          # ניהול ניווט בין דפים, אתחול
    ├── api.js          # כל קריאות ה-API + corsproxy + cache
    ├── scoring.js      # מנוע הציון המשוקלל + benchmarks לפי סקטור
    ├── chart.js        # TradingView Lightweight Charts
    ├── watchlist.js    # watchlist + התראות in-app
    ├── compare.js      # השוואת מניות (עד 3)
    └── i18n.js         # תרגומים עברית/אנגלית
```

## Architecture

### מבנה הדף

**Home Page:**
- Search bar גדול במרכז (Google-style) עם autocomplete (S&P 500 + ת"א 125)
- 5 מניות טרנדינג מתחת עם badge: 🔴/🟡/🟢
- Light/Dark mode toggle
- שפה: עברית כברירת מחדל, toggle לאנגלית

**Results Page:**
- Gauge/speedometer אנימטי עם ציון 0–100 — בולט בראש הדף
- אינדיקטור: 🔴 0–40 / 🟡 41–65 / 🟢 66–100
- מידע כללי: שווי שוק (Market cap), Beta, דיבידנד (כמידע בלבד, לא בציון)
- Earnings date: תאריך + "בעוד X ימים"
- Price target אנליסטים: ממוצע + min + max
- גרף מחיר מלא (TradingView) עם טווחים: 1W / 1M / 3M / 6M / 1Y / 3Y / 5Y
- חדשות אחרונות על המניה
- טבלת קריטריונים — מוצגת תמיד, כל קריטריון עם tooltip הסבר
- כפתור השוואה (עד 3 מניות)
- כפתור שיתוף: URL בפורמט `?s=AAPL` — נטען ישירות לתוצאות
- מניה שלא נמצאה → הודעת שגיאה ברורה
- Offline → cache אחרון עם תווית "נתונים מ-{תאריך}"
- Disclaimer: "אין לראות בניתוח זה ייעוץ פיננסי"

**Comparison Page:**
- גרפים זה ליד זה
- ביצועים יחסיים (% שינוי מנקודת התחלה)
- טבלה השוואתית שורה-שורה

**Watchlist:**
- שמירת מניות למעקב (localStorage)
- התראה in-app כשה-rating משתנה (🟡→🟢 וכו')

### קריטריונים + משקלות

| # | קטגוריה | משקל | נימוק |
|---|---------|------|-------|
| 1 | צמיחת רווחים (EPS Growth) | 18% | הפרדיקטור החזק ביותר לטווח ארוך |
| 2 | מכפילים (P/E, P/B, P/S) | 18% | בסיס כל ניתוח פונדמנטלי |
| 3 | צמיחת הכנסות (Revenue Growth) | 12% | איכות הצמיחה |
| 4 | המלצות אנליסטים | 12% | sentiment מקצועי |
| 5 | מומנטום מחיר | 12% | חזק לטווח בינוני |
| 6 | אחזקות מוסדיים | 8% | "כסף חכם" |
| 7 | חוב (Debt/Equity) | 8% | בריאות פיננסית |
| 8 | טכני (RSI, MACD) | 6% | פחות אמין לבדו |
| 9 | מרחק משיא (52w / ATH) | 4% | הקשר מחיר |
| 10 | שיאים שנשברו (1y/3y/5y) | 2% | עוצמת טרנד |

- כל קריטריון מוצג תמיד
- כשאין נתון: מציג "אין מידע", לא נכנס לחישוב
- משקלות קבועות
- נרמול לפי סקטור (טכנולוגיה / בנקים / אנרגיה / בריאות / נדל"ן / צריכה / תעשייה / תקשורת)

### מקורות נתונים

| נתון | מקור | הערות |
|------|------|-------|
| מחיר, P/E, P/B, P/S, 52w high/low | Yahoo Finance | לא רשמי, דרך corsproxy |
| היסטוריית מחירים (RSI, MACD, גרף, שיאים) | Yahoo Finance | |
| המלצות אנליסטים, אחזקות מוסדיים | Finnhub | API key נשמר ב-localStorage |
| EPS, Revenue, Debt/Equity | Financial Modeling Prep | חינמי, 250 req/day, API key ב-localStorage |
| מניות TASE | Yahoo Finance סימול `{ניירת}.TA` | ריאל-טיים בשעות מסחר (9:00–17:30), מחוץ לשעות → מחיר אחרון + תווית "סגור" |
| Autocomplete | רשימה מקומית S&P 500 + ת"א 125 | |
| מניות טרנדינג (דף הבית) | Finnhub | |

### Cache
- נתוני מניה נשמרים ב-localStorage למשך **15 דקות**
- מפתח: `bon-cache-{symbol}-{timestamp}`

### עיצוב
- Responsive — מותאם למובייל/טאבלט/דסקטופ
- Light/Dark mode toggle
- רקע: לבן (light) / שחור (dark)
- צבע ראשי: ירוק
- RTL עברית, LTR אנגלית
- ברירת מחדל: עברית

### אחסון (localStorage)
- `bon-watchlist` — מניות במעקב
- `bon-history` — היסטוריית חיפושים אחרונים
- `bon-theme` — light/dark
- `bon-lang` — שפה נבחרת
- `bon-cache-{symbol}` — cache נתוני מניה (15 דקות)
- `bon-finnhub-key` — Finnhub API key
- `bon-fmp-key` — Financial Modeling Prep API key

## Libraries

| ספרייה | מטרה | אופן שימוש |
|--------|------|-----------|
| [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) | גרפי מחיר | CDN, Apache 2.0 |

## Work Process Rules

- **לאחר כל שינוי — לבדוק בכרום שהכל עובד לפני שמסיימים.** להשתמש ב-MCP של כרום (screenshot, navigate, read_page) כדי לאמת שהשינויים נראים ומתפקדים כמצופה.

## Key Conventions

- כל ה-API calls דרך corsproxy.io (CORS) או allorigins.win כ-fallback
- API keys: default keys hardcoded כ-fallback, ניתן לדרוס ב-localStorage
- PWA: manifest + service worker, שם אפליקציה "BuyorNot"
- ציון סופי = סכום (ציון קטגוריה × משקל) — רק קטגוריות עם נתון תקף
- מניה ללא מספיק נתונים → הציון מוצג עם אזהרה "נתונים חלקיים"
- נרמול ציון כל קריטריון ← benchmark לפי סקטור (ראה scoring.js)
- רענון אוטומטי של נתונים כל 15 דקות (auto-refresh)

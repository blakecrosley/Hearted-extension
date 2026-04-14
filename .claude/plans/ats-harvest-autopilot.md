# ATS Harvest Autopilot — v2 (post-Codex review)

## Context

Safari extension (Hearted) content script injects a panel on Google search pages, auto-scrolls to scrape ATS board slugs, pipes to sk1ff.com. Manual run yielded 1,000 companies + 26K jobs from 4 ATS platforms. Appending single letters/numbers to queries surfaces different results (~10 pages each before diminishing returns).

## Goal

Automate query cycling so user only solves CAPTCHAs. Extension manages a queue of search queries, navigates between them, detects diminishing returns, and advances automatically.

## Query Matrix

### Supported ATS (6 — matching existing parsers in content script)

| ATS | Root Query |
|-----|-----------|
| Greenhouse | `site:job-boards.greenhouse.io/ inurl:jobs` |
| Lever | `site:jobs.lever.co inurl:apply` |
| Ashby | `site:jobs.ashbyhq.com` |
| Workable | `site:apply.workable.com` |
| BambooHR | `site:bamboohr.com inurl:careers` |
| Recruitee | `site:recruitee.com inurl:jobs` |

### Variants per ATS

**Alphabet/Number (10 pages each):**
`a b c d e f g h i j k l m n o p q r s t u v w x y z 1 2 3 0`

**Cities (10 pages each):**
`New York`, `San Francisco`, `Los Angeles`, `London`, `Berlin`, `Tokyo`, `Seattle`, `Austin`, `Boston`, `Denver`, `Chicago`, `Toronto`, `Singapore`, `Paris`

### Total: 6 ATS × (1 root + 30 alpha + 14 cities) = 270 queries

Root queries get 50 page max; variants get 10.

## Architecture

### Query Queue (browser.storage.local)

```json
{
  "_gh_query_queue": [
    { "query": "site:jobs.ashbyhq.com", "maxPages": 50, "pagesScanned": 0, "newThisQuery": 0, "consecutiveZero": 0, "status": "pending" },
    { "query": "site:jobs.ashbyhq.com a", "maxPages": 10, "pagesScanned": 0, "newThisQuery": 0, "consecutiveZero": 0, "status": "pending" }
  ],
  "_gh_queue_index": 0,
  "_gh_queue_paused": false,
  "_gh_owner_tab": null,
  "_gh_session_captcha_count": 0,
  "_gh_session_query_count": 0
}
```

Query order: randomized within each ATS block (root always first, then shuffled variants).

### Flow

1. Content script loads on Google page
2. **Tab lock**: Check `_gh_owner_tab` — if owned by another tab, show "Queue active in another tab" and exit. Otherwise claim ownership.
3. **CAPTCHA check**: If on `/sorry/index` or body contains "unusual traffic" → CAPTCHA mode
   - Panel: "⚠ CAPTCHA — solve it, I'll wait..."
   - Poll every 2s: check for `#search` or `#rso` element (generic, not ATS-specific)
   - Track CAPTCHA frequency: if 3 CAPTCHAs in last 10 queries → auto-pause 5 minutes
4. **Search results page**: Auto-run scan (scroll, scrape, collect slugs)
5. **After scan**:
   a. **Await** backend send to sk1ff (must complete before any navigation)
   b. Count `newThisPage` = slugs first seen this session on this page (not "new vs baseline" — new vs everything seen so far this session)
   c. If `newThisPage == 0` → increment `consecutiveZero`; else reset to 0
   d. If `consecutiveZero >= 3` OR `pagesScanned >= maxPages` → mark query "done", advance to next query
   e. Else → click Next page (existing logic)
6. **Query switch**:
   a. Human-like delay: 30-60s (randomized)
   b. Navigate via `window.location.href = 'https://www.google.com/search?q=' + encodeURIComponent(nextQuery)` (deterministic, no form manipulation)
   c. Increment session query count
   d. If session query count >= 200 → auto-pause ("Session cap reached")

### Diminishing Returns

Two separate concepts:
- `knownSlugs` (Set): loaded from bundled JSON — these are in our registry already. Used for NEW/KNOWN badge display.
- `sessionSeen` (Set): all slugs seen in ANY page this session. Used for diminishing returns. A slug is "new this page" only if it wasn't in `sessionSeen` before this page.

This prevents the failure mode where a slug is "new vs baseline" but already found 3 queries ago.

### CAPTCHA Handling

1. **Detect**: `/sorry/index` path OR "unusual traffic" in body OR reCAPTCHA iframe
2. **Panel**: "⚠ CAPTCHA — solve it, I'll wait..." with orange progress bar
3. **Poll**: Every 2s check for `document.querySelector('#search, #rso, #botstuff')` — generic search results indicators, not ATS-specific
4. **On clear**: Page navigates to `continue=` URL → content script re-injects → auto-run
5. **Backoff**: Track CAPTCHAs per session. After 3 in 10 queries → 5 minute cooldown. After 5 total → suggest VPN switch.

### Safety / Anti-Detection

- **Session cap**: 200 queries max per session (manual reset via panel button)
- **Page cap**: 50 per root query, 10 per variant
- **Inter-query delay**: 30-60s randomized (not 5-8s — too fast)
- **Inter-page delay**: 2-4s (existing, keep)
- **Randomized query order**: Root first, then variants shuffled
- **CAPTCHA backoff**: Exponential cooldown on repeated CAPTCHAs
- **Single tab lock**: Only one tab can own the queue at a time
- **Auto-pause on 100 consecutive known-only pages**: Session is exhausted
- **No URL parameter manipulation**: Direct navigation to search URL (Google sees it as a fresh search, not pagination trickery)

### Tab Ownership

```javascript
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

async function claimQueue() {
  const stored = await browser.storage.local.get('_gh_owner_tab');
  if (stored._gh_owner_tab && stored._gh_owner_tab !== TAB_ID) {
    // Another tab owns it — check if it's still alive (stale = >60s old)
    const age = Date.now() - (stored._gh_owner_tab_ts || 0);
    if (age < 60000) return false; // still active
  }
  await browser.storage.local.set({ _gh_owner_tab: TAB_ID, _gh_owner_tab_ts: Date.now() });
  return true;
}

// Heartbeat every 30s
setInterval(() => {
  browser.storage.local.set({ _gh_owner_tab_ts: Date.now() });
}, 30000);

// Release on unload
window.addEventListener('beforeunload', () => {
  browser.storage.local.remove(['_gh_owner_tab', '_gh_owner_tab_ts']);
});
```

### Panel UI

```
┌──────────────────────────────────────┐
│ 🌱 ATS Harvest           3 new  ⏸ − │
│ ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░  12%  │
│ Q 12/270  "...ashbyhq.com m"  P 4/10 │
│ Session: 847 new / 2,103 scanned     │
│ Next query in 42s...                 │
├──────────────────────────────────────┤
│  NEW  acmecorp                       │
│  NEW  widgetinc                      │
│ KNOWN databricks                     │
├──────────────────────────────────────┤
│  ⏸ Pause    ⏭ Skip    Reset Queue   │
└──────────────────────────────────────┘
```

## Files to Modify

1. `Shared (Extension)/Resources/content-greenhouse-harvest.js` — query queue, auto-navigate, diminishing returns, tab lock, updated panel

## Not in Scope (v2)

- SmartRecruiters, JazzHR, Rippling parsers (add patterns first, then add queries)
- Workable API verification (403 — needs browser-tier, separate effort)
- Auto-CAPTCHA solving (not possible with reCAPTCHA Enterprise)

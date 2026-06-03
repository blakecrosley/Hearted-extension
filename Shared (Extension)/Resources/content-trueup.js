// Hearted — trueup.io DOM capture
// Injects a floating "Save DOM" button. Click sends the full rendered DOM
// to a local dev endpoint on resumegeni so the agent can read the payload.

(function () {
  'use strict';

  // Skip injection on Cloudflare challenge pages (we want the real DOM, not "Just a moment...")
  if (/just a moment/i.test(document.title)) {
    // Still inject the button — user can retry after challenge clears.
  }

  const BTN_ID = 'hearted-trueup-save-btn';
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = 'Save DOM';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: '2147483647',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '0',
    background: 'linear-gradient(135deg, #e91e63 0%, #9c27b0 100%)',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    letterSpacing: '0.02em',
  });

  function setState(text, bg) {
    btn.textContent = text;
    if (bg) btn.style.background = bg;
  }

  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    setState('Saving…', null);
    btn.disabled = true;

    const payload = {
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      html: document.documentElement.outerHTML,
    };

    // Endpoints to try in order. Safari may block http://127.0.0.1 due to
    // mixed content; the extension's scheme (safari-web-extension://...)
    // has its own policy; we try direct HTTPS-ish paths first and fall
    // back to the background worker.
    const endpoints = [
      'http://127.0.0.1:8001/dev/hearted-dom',
      'http://localhost:8001/dev/hearted-dom',
    ];

    const withTimeout = (p, ms, label) =>
      Promise.race([
        p,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`timeout ${ms}ms [${label}]`)), ms)
        ),
      ]);

    let lastErr = null;

    // 1) direct fetch from the content script
    for (const url of endpoints) {
      try {
        setState(`→ ${url.split('/')[2]}`, null);
        const resp = await withTimeout(
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            mode: 'cors',
            credentials: 'omit',
          }),
          10000,
          'direct fetch'
        );
        if (resp.ok) {
          const data = await resp.json().catch(() => ({}));
          setState(
            `Saved → ${(data.path || '').split('/').pop() || 'ok'}`,
            'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)'
          );
          lastErr = null;
          break;
        } else {
          lastErr = new Error(`HTTP ${resp.status} on ${url}`);
        }
      } catch (e) {
        lastErr = e;
        console.warn('[Hearted trueup] direct fetch failed', url, e);
      }
    }

    // 2) fallback to background.js if direct fetch failed
    if (lastErr) {
      try {
        setState('→ background worker', null);
        const resp = await withTimeout(
          browser.runtime.sendMessage({ action: 'captureDomLocal', data: payload }),
          10000,
          'background'
        );
        if (resp && resp.success) {
          setState(
            `Saved → ${(resp.data?.path || '').split('/').pop() || 'ok'}`,
            'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)'
          );
          lastErr = null;
        } else {
          lastErr = new Error(resp?.error || 'background returned !success');
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (lastErr) {
      console.error('[Hearted trueup] all paths failed:', lastErr);
      setState(
        'Error: ' + (lastErr.message || lastErr).slice(0, 60),
        'linear-gradient(135deg, #f44336 0%, #c62828 100%)'
      );
    }

    setTimeout(() => {
      btn.disabled = false;
      setState(original, 'linear-gradient(135deg, #e91e63 0%, #9c27b0 100%)');
    }, 6000);
  });

  document.documentElement.appendChild(btn);
})();

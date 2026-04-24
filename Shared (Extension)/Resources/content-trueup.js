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

    try {
      const resp = await browser.runtime.sendMessage({
        action: 'captureDomLocal',
        data: payload,
      });
      if (resp && resp.success) {
        setState(`Saved → ${resp.data?.path?.split('/').pop() || 'ok'}`,
          'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)');
      } else {
        throw new Error(resp?.error || 'unknown error');
      }
    } catch (err) {
      console.error('[Hearted trueup] save failed:', err);
      setState('Error: ' + (err.message || err),
        'linear-gradient(135deg, #f44336 0%, #c62828 100%)');
    }

    setTimeout(() => {
      btn.disabled = false;
      setState(original, 'linear-gradient(135deg, #e91e63 0%, #9c27b0 100%)');
    }, 4000);
  });

  document.documentElement.appendChild(btn);
})();

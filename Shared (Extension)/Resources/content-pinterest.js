// Hearted - Pinterest Content Script
// Scrapes pins from Pinterest boards and saved pins

(function() {
  'use strict';

  const CAPTURED_PINS = new Set();
  let isCapturing = false;
  let captureCount = 0;

  // Check if we're on a page with pins (much more permissive now)
  function isPinsPage() {
    // Check for any Pinterest page that could have pins
    const path = window.location.pathname;

    // Explicit pins pages
    if (path.includes('/saved') ||
        path.includes('/pins') ||
        path.includes('/board') ||
        path.includes('/_saved') ||
        path.includes('/pin/')) {
      return true;
    }

    // Home feed and profile pages
    if (path === '/' ||
        path === '/homefeed/' ||
        path.match(/^\/[a-zA-Z0-9_]+\/?$/)) {  // Profile pages like /username/
      return true;
    }

    // Check if pins exist on the page (fallback)
    return document.querySelector('[data-test-id="pin"]') !== null;
  }

  // Extract pin data from a pin element
  function extractPinData(pinElement) {
    try {
      // Get pin ID directly from data attribute (most reliable)
      let pinId = pinElement.getAttribute('data-test-pin-id');

      // Fallback to URL extraction
      if (!pinId) {
        const pinLink = pinElement.querySelector('a[href*="/pin/"]');
        if (!pinLink) return null;
        pinId = pinLink.href.match(/\/pin\/(\d+)/)?.[1];
      }

      if (!pinId || CAPTURED_PINS.has(pinId)) {
        return null;
      }

      // Build pin URL
      const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;

      // Get image - try multiple selectors
      const img = pinElement.querySelector('img[src*="pinimg.com"]') ||
                  pinElement.querySelector('img[src*="i.pinimg"]');
      let imageUrl = img?.src || '';

      // Get highest quality version
      if (imageUrl) {
        // Pinterest uses /236x/, /474x/, /736x/, /originals/
        // Try to get originals, fall back to 736x
        imageUrl = imageUrl
          .replace(/\/236x\//, '/736x/')
          .replace(/\/474x\//, '/736x/');
      }

      // Get title from alt text (Pinterest generates descriptive alts)
      let title = img?.alt || '';
      // Clean up Pinterest's auto-generated alt text
      if (title.startsWith('This may contain:') || title.startsWith('This contains')) {
        title = title.replace(/^This (may contain|contains)[^:]*:\s*/i, '').trim();
      }

      // Get description if available
      const description = pinElement.querySelector('[data-test-id="truncated-description"]')?.textContent ||
                         pinElement.querySelector('[data-test-id="pin-description"]')?.textContent || '';

      // Get source URL if available (external link)
      const sourceLink = pinElement.querySelector('a[href*="://"][href*="."]');
      let sourceUrl = sourceLink?.href;
      // Filter out pinterest internal links
      if (sourceUrl && sourceUrl.includes('pinterest.com')) {
        sourceUrl = null;
      }

      // Try to get board name from page context
      const boardName = document.querySelector('[data-test-id="board-name"]')?.textContent || '';

      return {
        source_id: pinId,
        url: pinUrl,
        title: title || `Pinterest Pin ${pinId}`,
        description: description || title,
        image_url: imageUrl,
        content_type: 'image',
        source: 'pinterest',
        raw_data: {
          pin_id: pinId,
          image_url: imageUrl,
          title: title,
          description: description,
          source_url: sourceUrl,
          board_name: boardName
        }
      };
    } catch (e) {
      console.error('Hearted: Error extracting pin data', e);
      return null;
    }
  }

  // Capture a single pin
  async function capturePin(pinData) {
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage({
        action: 'capturePin',
        data: pinData
      }, response => {
        if (response?.success) {
          CAPTURED_PINS.add(pinData.source_id);
          captureCount++;
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }

  // Scan visible pins and capture new ones
  async function scanAndCapture() {
    if (!isCapturing) return;

    // Primary selector - data-test-id="pin" with pin ID attribute
    let pins = document.querySelectorAll('[data-test-id="pin"][data-test-pin-id]');

    // Fallback selectors if primary doesn't work
    if (pins.length === 0) {
      const fallbackSelectors = [
        '[data-test-id="pin"]',
        '[data-test-id="pinWrapper"]',
        '[data-grid-item-idx]'
      ];

      for (const selector of fallbackSelectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          pins = found;
          break;
        }
      }
    }

    // Last resort: find from pin links
    if (pins.length === 0) {
      const pinLinks = document.querySelectorAll('a[href*="/pin/"]');
      const pinSet = new Set();
      pinLinks.forEach(link => {
        const container = link.closest('[data-test-id="pin"]') ||
                         link.closest('[role="listitem"]') ||
                         link.closest('[data-grid-item-idx]');
        if (container) pinSet.add(container);
      });
      pins = Array.from(pinSet);
    }

    console.log(`Hearted: Scanning ${pins.length} pins`);

    for (const pin of pins) {
      const pinData = extractPinData(pin);
      if (pinData) {
        try {
          await capturePin(pinData);
          // Add visual indicator
          pin.style.outline = '3px solid #e91e63';
          pin.style.outlineOffset = '-3px';
        } catch (e) {
          console.error('Hearted: Failed to capture pin', e);
        }
      }
    }
  }

  // Create floating capture button
  function createCaptureUI() {
    // Don't create if already exists
    if (document.getElementById('hearted-capture-ui')) return;

    const container = document.createElement('div');
    container.id = 'hearted-capture-ui';
    container.innerHTML = `
      <style>
        #hearted-capture-ui {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        #hearted-capture-btn {
          background: linear-gradient(135deg, #e91e63 0%, #bd081c 100%);
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 24px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(189, 8, 28, 0.4);
          display: flex;
          align-items: center;
          gap: 8px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        #hearted-capture-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(189, 8, 28, 0.5);
        }
        #hearted-capture-btn.active {
          background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
          box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
        }
        #hearted-count {
          background: rgba(255,255,255,0.2);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }
      </style>
      <button id="hearted-capture-btn">
        <span>📌</span>
        <span id="hearted-label">Start Capture</span>
        <span id="hearted-count">0</span>
      </button>
    `;

    document.body.appendChild(container);

    const btn = document.getElementById('hearted-capture-btn');
    const label = document.getElementById('hearted-label');
    const count = document.getElementById('hearted-count');

    btn.addEventListener('click', () => {
      isCapturing = !isCapturing;

      if (isCapturing) {
        btn.classList.add('active');
        label.textContent = 'Capturing...';
        scanAndCapture();
      } else {
        btn.classList.remove('active');
        label.textContent = 'Start Capture';
      }
    });

    // Update count display
    setInterval(() => {
      count.textContent = captureCount;
    }, 500);
  }

  // Set up scroll listener for continuous capture
  function setupScrollListener() {
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      if (!isCapturing) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(scanAndCapture, 500);
    });
  }

  // Initialize with retry
  function init() {
    // Remove any existing UI first (for re-init on SPA navigation)
    const existingUI = document.getElementById('hearted-capture-ui');
    if (existingUI) {
      existingUI.remove();
    }

    if (isPinsPage()) {
      console.log('Hearted: Detected Pinterest pins page, initializing capture UI');
      createCaptureUI();
      setupScrollListener();
    } else {
      console.log('Hearted: Not a pins page, path:', window.location.pathname);
    }
  }

  // Run on page load with retries for dynamic content
  function initWithRetry(attempts = 0) {
    if (attempts > 5) {
      console.log('Hearted: Max init attempts reached');
      return;
    }

    // Check if pins have loaded
    const hasPins = document.querySelector('[data-test-id="pin"]') !== null;
    const hasUI = document.getElementById('hearted-capture-ui') !== null;

    if (hasPins && !hasUI) {
      init();
    } else if (!hasPins && attempts < 5) {
      // Retry after delay - Pinterest loads content dynamically
      setTimeout(() => initWithRetry(attempts + 1), 1000);
    }
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initWithRetry(0));
  } else {
    // Page already loaded, but Pinterest content may still be loading
    setTimeout(() => initWithRetry(0), 500);
  }

  // Also check on URL changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Reset capturing state on navigation
      isCapturing = false;
      captureCount = 0;
      CAPTURED_PINS.clear();
      setTimeout(() => initWithRetry(0), 1000);
    }
  }).observe(document.body, { subtree: true, childList: true });

})();

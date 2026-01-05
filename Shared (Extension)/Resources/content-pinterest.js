// Hearted - Pinterest Content Script
// Scrapes pins from Pinterest boards and saved pins

(function() {
  'use strict';

  const CAPTURED_PINS = new Set();
  let isCapturing = false;
  let captureCount = 0;

  // Check if we're on a pins/saves page
  function isPinsPage() {
    const path = window.location.pathname;
    return path.includes('/saved') ||
           path.includes('/pins') ||
           path.includes('/board') ||
           path.includes('/_saved');
  }

  // Extract pin data from a pin element
  function extractPinData(pinElement) {
    try {
      // Find the pin link
      const pinLink = pinElement.querySelector('a[href*="/pin/"]');
      if (!pinLink) return null;

      const pinUrl = pinLink.href;
      const pinId = pinUrl.match(/\/pin\/(\d+)/)?.[1];

      if (!pinId || CAPTURED_PINS.has(pinId)) {
        return null;
      }

      // Get image
      const img = pinElement.querySelector('img[src*="pinimg.com"]');
      let imageUrl = img?.src || '';

      // Get highest quality version
      if (imageUrl) {
        // Pinterest uses /236x/, /474x/, /736x/, /originals/
        imageUrl = imageUrl
          .replace(/\/\d+x\//, '/originals/')
          .replace(/\/236x\//, '/736x/')
          .replace(/\/474x\//, '/736x/');
      }

      // Get title/alt text
      const title = img?.alt || pinElement.querySelector('[data-test-id="pin-title"]')?.textContent || '';

      // Get description if available
      const description = pinElement.querySelector('[data-test-id="truncated-description"]')?.textContent || '';

      // Get source URL if available
      const sourceLink = pinElement.querySelector('a[href*="://"][href*="."]');
      const sourceUrl = sourceLink?.href;

      // Try to get board name
      const boardName = document.querySelector('[data-test-id="board-name"]')?.textContent || '';

      return {
        source_id: pinId,
        url: pinUrl,
        title: title || `Pin ${pinId}`,
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

    // Pinterest uses various selectors for pins
    const pinSelectors = [
      '[data-test-id="pin"]',
      '[data-test-id="pinWrapper"]',
      '[data-grid-item]',
      '.GrowthUnauthPinImage',
      '.PinCard'
    ];

    let pins = [];
    for (const selector of pinSelectors) {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        pins = found;
        break;
      }
    }

    // Fallback: find all elements with pin links
    if (pins.length === 0) {
      const pinLinks = document.querySelectorAll('a[href*="/pin/"]');
      pins = Array.from(pinLinks).map(link => link.closest('[role="listitem"]') || link.parentElement).filter(Boolean);
    }

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

  // Initialize
  function init() {
    if (isPinsPage()) {
      console.log('Hearted: Detected Pinterest pins page, initializing capture UI');
      createCaptureUI();
      setupScrollListener();
    }
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000); // Pinterest loads content dynamically
  }

  // Also check on URL changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 1500);
    }
  }).observe(document.body, { subtree: true, childList: true });

})();

// Hearted - Extension Popup Script

const API_BASE = 'http://localhost:8100/api';

// DOM elements
const pageTitle = document.getElementById('page-title');
const pageUrl = document.getElementById('page-url');
const saveBtn = document.getElementById('save-btn');
const btnText = document.getElementById('btn-text');
const status = document.getElementById('status');
const stats = document.getElementById('stats');

// Current tab info
let currentTab = null;

// Initialize popup
async function init() {
  try {
    // Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];

    if (currentTab) {
      pageTitle.textContent = currentTab.title || 'Untitled';
      pageUrl.textContent = currentTab.url;

      // Check if already saved
      const exists = await checkDuplicate(currentTab.url);
      if (exists) {
        saveBtn.classList.add('success');
        btnText.textContent = 'Already Saved ✓';
        saveBtn.disabled = true;
      }
    }

    // Load stats
    loadStats();
  } catch (e) {
    console.error('Init error:', e);
    status.textContent = 'Error loading page info';
    status.classList.add('error');
  }
}

// Check if URL already exists
async function checkDuplicate(url) {
  try {
    const response = await fetch(`${API_BASE}/check-duplicate?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      const data = await response.json();
      return data.exists;
    }
  } catch (e) {
    // API might not be running, ignore
  }
  return false;
}

// Save current page
async function savePage() {
  if (!currentTab) return;

  saveBtn.disabled = true;
  btnText.textContent = 'Saving...';
  status.textContent = '';
  status.className = 'status';

  try {
    // Extract metadata from the page
    const metadata = await extractPageMetadata();

    const response = await fetch(`${API_BASE}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: currentTab.url,
        title: currentTab.title,
        ...metadata
      })
    });

    if (response.ok) {
      const data = await response.json();
      saveBtn.classList.add('success');
      btnText.textContent = 'Saved! ❤️';
      status.textContent = data.is_duplicate ? 'Already in your archive' : 'Added to your archive';
      status.classList.add('success');

      // Update stats
      loadStats();
    } else {
      throw new Error(`API error: ${response.status}`);
    }
  } catch (e) {
    console.error('Save error:', e);
    saveBtn.classList.add('error');
    btnText.textContent = 'Error';
    status.textContent = e.message.includes('Failed to fetch')
      ? 'Is the Hearted server running?'
      : e.message;
    status.classList.add('error');

    // Reset button after delay
    setTimeout(() => {
      saveBtn.classList.remove('error');
      saveBtn.disabled = false;
      btnText.textContent = 'Save This Page';
    }, 3000);
  }
}

// Extract metadata from the current page
async function extractPageMetadata() {
  try {
    const results = await browser.tabs.executeScript(currentTab.id, {
      code: `
        (function() {
          const getMeta = (name) => {
            const el = document.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]');
            return el ? el.content : null;
          };

          return {
            description: getMeta('og:description') || getMeta('description') || '',
            image_url: getMeta('og:image') || getMeta('twitter:image') || '',
            site_name: getMeta('og:site_name') || '',
            type: getMeta('og:type') || ''
          };
        })();
      `
    });

    return results[0] || {};
  } catch (e) {
    console.error('Metadata extraction error:', e);
    return {};
  }
}

// Load archive stats
async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    if (response.ok) {
      const data = await response.json();
      stats.textContent = `${data.total_items || 0} items saved`;
    }
  } catch (e) {
    stats.textContent = 'Server offline';
  }
}

// Event listeners
saveBtn.addEventListener('click', savePage);

// Initialize on load
init();

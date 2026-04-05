// Hearted - Background Service Worker
// Handles communication between content scripts and the local API

const BACKENDS = {
  'hearted': 'https://h3arted.com/api',
  'midjourney-studio': 'http://localhost:8200/api',
  'midjourney-studio-prod': 'https://sk1ff.com'
};
const API_BASE = BACKENDS['hearted'];

// Get stored API key from browser storage
async function getApiKey() {
  try {
    const result = await browser.storage.local.get('apiKey');
    return result.apiKey || '';
  } catch (error) {
    console.error('Failed to get API key:', error);
    return '';
  }
}

// Helper to create headers with API key
async function getAuthHeaders() {
  const apiKey = await getApiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // API Key management
  if (message.action === 'setApiKey') {
    browser.storage.local.set({ apiKey: message.apiKey })
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'getApiKey') {
    getApiKey()
      .then(apiKey => sendResponse({ success: true, apiKey }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'capture') {
    captureItem(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'captureTweet') {
    captureTweet(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'capturePin') {
    capturePin(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'captureMidjourney') {
    console.log('Hearted BG: Received captureMidjourney message');
    console.log('Hearted BG: Data:', JSON.stringify(message.data, null, 2));
    captureMidjourney(message.data)
      .then(result => {
        console.log('Hearted BG: Capture succeeded:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('Hearted BG: Capture failed:', error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'captureLike') {
    captureLike(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'captureSref') {
    captureSref(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'updateInstagramImage') {
    updateInstagramImage(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'checkDuplicate') {
    checkDuplicate(message.url)
      .then(result => sendResponse({ success: true, exists: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Queue operations (sk1ff.com)
  if (message.action === 'getQueueItems') {
    getQueueItems(message.status || 'pending')
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'markQueueItemDone') {
    markQueueItemDone(message.itemId)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Suno queue operations (same backend, filtered by source=suno)
  if (message.action === 'getSunoQueueItems') {
    getSunoQueueItems(message.status || 'pending')
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'markSunoQueueItemDone') {
    markQueueItemDone(message.itemId)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Capture a generic URL
async function captureItem(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/capture`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a tweet
async function captureTweet(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/capture/tweet`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a Pinterest pin
async function capturePin(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/capture/pin`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a Midjourney image
async function captureMidjourney(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/capture/midjourney`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Capture a liked image → sk1ff.com (midjourney-studio prod)
async function captureLike(data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const payload = {
    image_url: data.image_url,
    source: data.source || 'explore'
  };
  if (data.job_id) payload.job_id = data.job_id;
  if (data.prompt_text) payload.prompt_text = data.prompt_text;
  if (data.parameters) payload.parameters = data.parameters;
  if (data.oref_urls) payload.oref_urls = data.oref_urls;
  if (data.username) payload.username = data.username;

  // Download the image in the extension (we have MJ domain access)
  if (data.image_url) {
    try {
      const imgResp = await fetch(data.image_url);
      if (imgResp.ok) {
        const blob = await imgResp.blob();
        if (blob.size <= 10 * 1024 * 1024) {
          payload.image_data = await blobToBase64(blob);
          payload.image_content_type = blob.type || 'image/webp';
        }
      }
    } catch (e) {
      console.warn('Hearted BG: Failed to download like image:', e.message);
    }
  }

  try {
    const response = await fetch(
      `${BACKENDS['midjourney-studio-prod']}/profiles/api/ingest-like`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `API error: ${response.status}`);
    }
    return response.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('sk1ff.com unreachable');
    throw e;
  }
}

// Update Instagram item with image
async function updateInstagramImage(data) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/instagram/enrich`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Check if URL already exists
async function checkDuplicate(url) {
  const apiKey = await getApiKey();
  const headers = {};
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${API_BASE}/check-duplicate?url=${encodeURIComponent(url)}`, {
    headers
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  return data.exists;
}

// Convert blob to base64 string (service worker compatible, no FileReader)
async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Capture a style reference → midjourney-studio
async function captureSref(data) {
  const payload = { code: data.code };

  // Fetch all preview images (extension has <all_urls> permission)
  const imageUrls = data.image_urls || (data.image_url ? [data.image_url] : []);
  if (imageUrls.length > 0) {
    const images = [];
    for (const url of imageUrls) {
      try {
        const imgResponse = await fetch(url);
        if (imgResponse.ok) {
          const blob = await imgResponse.blob();
          if (blob.size <= 5 * 1024 * 1024) {
            images.push({
              data: await blobToBase64(blob),
              content_type: blob.type || 'image/webp'
            });
          }
        }
      } catch (e) {
        console.warn('Hearted BG: Failed to fetch sref preview image:', e.message);
      }
    }
    if (images.length > 0) {
      payload.images = images;
    }
  }

  // Forward name/notes/tags if provided
  if (data.name) payload.name = data.name;
  if (data.notes) payload.notes = data.notes;
  if (data.tags) payload.tags = data.tags;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${BACKENDS['midjourney-studio']}/srefs/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || err.error || `API error: ${response.status}`);
    }

    return response.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('midjourney-studio (localhost:8200) is unreachable. Is the server running?');
    }
    throw e;
  }
}

// Fetch pending queue items from sk1ff.com
async function getQueueItems(status) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${BACKENDS['midjourney-studio-prod']}/queue/api/items?status=${encodeURIComponent(status)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('sk1ff.com unreachable');
    throw e;
  }
}

// Fetch pending Suno queue items from sk1ff.com (filtered by source=suno)
async function getSunoQueueItems(status) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${BACKENDS['midjourney-studio-prod']}/queue/api/items?status=${encodeURIComponent(status)}&source=suno`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('sk1ff.com unreachable');
    throw e;
  }
}

// Mark a queue item done/pending on sk1ff.com
async function markQueueItemDone(itemId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${BACKENDS['midjourney-studio-prod']}/queue/api/${itemId}/done`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `API error: ${response.status}`);
    }
    return response.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('sk1ff.com unreachable');
    throw e;
  }
}

// Keyboard shortcut handler (Cmd+Shift+H)
browser.commands?.onCommand?.addListener((command) => {
  if (command === 'save-page') {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        captureItem({
          url: tabs[0].url,
          title: tabs[0].title
        });
      }
    });
  }
});

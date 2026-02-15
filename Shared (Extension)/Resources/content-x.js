// Hearted - X.com Content Script
// Scrapes liked tweets as user scrolls through their likes page

(function() {
  'use strict';

  const CAPTURED_TWEETS = new Set();
  let isCapturing = false;
  let captureCount = 0;
  let failCount = 0;
  let scanCount = 0;

  // Check if we're on a likes page
  function isLikesPage() {
    return window.location.pathname.includes('/likes');
  }

  // Show a toast notification in the capture UI
  function showToast(message, type = 'error') {
    const existing = document.getElementById('hearted-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'hearted-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 20px;
      z-index: 10000;
      padding: 10px 16px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: white;
      background: ${type === 'error' ? '#d32f2f' : type === 'warn' ? '#f57c00' : '#388e3c'};
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.2s, transform 0.2s;
    `;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Auto-dismiss
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }

  // Extract tweet data from a tweet article element
  function extractTweetData(article) {
    try {
      // Get tweet URL from time element's parent link
      const timeLink = article.querySelector('time')?.closest('a');
      const tweetUrl = timeLink?.href;

      if (!tweetUrl || CAPTURED_TWEETS.has(tweetUrl)) {
        return null;
      }

      // Extract tweet ID from URL
      const tweetId = tweetUrl.split('/status/')[1]?.split('?')[0];
      if (!tweetId) return null;

      // Get author info
      const authorLink = article.querySelector('[data-testid="User-Name"] a');
      const authorName = authorLink?.textContent || '';
      const authorHandle = article.querySelector('[data-testid="User-Name"] a[href^="/"]')?.getAttribute('href')?.slice(1) || '';

      // Get tweet text
      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      const tweetText = tweetTextEl?.textContent || '';

      // Get images
      const images = [];
      article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
        const src = img.src;
        if (src && !src.includes('profile_images')) {
          // Get highest quality version
          const highQualitySrc = src.replace(/\?.*$/, '?format=jpg&name=large');
          images.push(highQualitySrc);
        }
      });

      // Check for video content
      let hasVideo = false;
      let videoUrl = null;
      let videoThumbnail = null;

      const videoPlayer = article.querySelector('[data-testid="videoPlayer"]');
      if (videoPlayer) {
        hasVideo = true;

        // Try to get video URL directly from video element
        const videoEl = videoPlayer.querySelector('video');
        if (videoEl) {
          // Check video src attribute
          if (videoEl.src && videoEl.src.includes('video.twimg.com')) {
            videoUrl = videoEl.src;
          }

          // Check source elements
          const sources = videoEl.querySelectorAll('source');
          sources.forEach(source => {
            const src = source.src;
            if (src && src.includes('video.twimg.com') && src.includes('.mp4')) {
              // Prefer mp4 over m3u8
              if (!videoUrl || !videoUrl.includes('.mp4')) {
                videoUrl = src;
              }
            }
          });

          // Get poster as thumbnail
          if (videoEl.poster) {
            videoThumbnail = videoEl.poster;
          }
        }

        // Also try to get thumbnail from img in video container
        const thumbImg = videoPlayer.querySelector('img');
        if (thumbImg && thumbImg.src && !thumbImg.src.includes('profile_images')) {
          videoThumbnail = thumbImg.src;
          if (!images.includes(videoThumbnail)) {
            images.push(videoThumbnail);
          }
        }
      }

      // Determine content type
      let contentType = 'tweet';
      if (hasVideo) {
        contentType = 'video';
      } else if (images.length > 0) {
        contentType = 'image';
      }

      return {
        source_id: tweetId,
        url: tweetUrl,
        title: `@${authorHandle}: ${tweetText.slice(0, 100)}${tweetText.length > 100 ? '...' : ''}`,
        description: tweetText,
        author: authorName,
        author_handle: authorHandle,
        images: images,
        image_url: images[0] || null,
        content_type: contentType,
        source: 'x',
        raw_data: {
          tweet_id: tweetId,
          author_name: authorName,
          author_handle: authorHandle,
          text: tweetText,
          images: images,
          has_video: hasVideo,
          video_url: videoUrl,
          video_thumbnail: videoThumbnail
        }
      };
    } catch (e) {
      console.error('Hearted: Error extracting tweet data', e);
      return null;
    }
  }

  // Capture a single tweet
  async function captureTweet(tweetData) {
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage({
        action: 'captureTweet',
        data: tweetData
      }, response => {
        if (browser.runtime.lastError) {
          reject(new Error(browser.runtime.lastError.message || 'Extension messaging failed'));
          return;
        }
        if (response?.success) {
          captureCount++;
          updateBadge();
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }

  // Classify error for user-friendly messaging
  function classifyError(errorMsg) {
    const msg = (errorMsg || '').toLowerCase();
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('api key')) {
      return { message: 'API key missing or invalid — set it in the extension popup', type: 'error' };
    }
    if (msg.includes('403') || msg.includes('forbidden')) {
      return { message: 'API rejected the request (403 Forbidden)', type: 'error' };
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      return { message: 'Rate limited — slow down scrolling', type: 'warn' };
    }
    if (msg.includes('500') || msg.includes('server error')) {
      return { message: 'Server error — h3arted.com may be down', type: 'error' };
    }
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network')) {
      return { message: 'Cannot reach h3arted.com — check connection', type: 'error' };
    }
    if (msg.includes('extension messaging')) {
      return { message: 'Extension error — try reloading the page', type: 'error' };
    }
    return { message: `Capture failed: ${errorMsg}`, type: 'error' };
  }

  // Scan visible tweets and capture new ones
  async function scanAndCapture() {
    if (!isCapturing) return;

    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    scanCount++;

    // Warn if no tweet elements found (possible DOM change)
    if (articles.length === 0 && scanCount <= 2) {
      console.warn('Hearted: No article[data-testid="tweet"] elements found — Twitter may have changed their DOM');
      showToast('No tweets detected — Twitter may have updated their layout', 'warn');
      return;
    }

    let scanFails = 0;
    let firstError = null;

    for (const article of articles) {
      const tweetData = extractTweetData(article);
      if (tweetData) {
        // Mark as captured IMMEDIATELY to prevent race conditions
        // (before async capture completes)
        CAPTURED_TWEETS.add(tweetData.url);
        try {
          await captureTweet(tweetData);
          // Add visual indicator
          article.style.borderLeft = '3px solid #e91e63';
        } catch (e) {
          console.error('Hearted: Failed to capture tweet', e);
          // Remove from set if capture failed so it can be retried
          CAPTURED_TWEETS.delete(tweetData.url);
          failCount++;
          scanFails++;
          if (!firstError) firstError = e.message;
          // Mark failed tweet with orange border
          article.style.borderLeft = '3px solid #ff9800';
        }
      }
    }

    // Show toast for failures in this scan pass
    if (scanFails > 0 && firstError) {
      const { message, type } = classifyError(firstError);
      const prefix = scanFails > 1 ? `${scanFails} tweets failed: ` : '';
      showToast(prefix + message, type);
    }

    updateCountDisplay();
  }

  // Update extension badge with capture count
  function updateBadge() {
    browser.runtime.sendMessage({
      action: 'updateBadge',
      count: captureCount
    });
  }

  // Update the count display in the button
  function updateCountDisplay() {
    const countEl = document.getElementById('hearted-count');
    if (!countEl) return;

    if (failCount > 0) {
      countEl.textContent = `${captureCount} / ${failCount} err`;
      countEl.style.background = 'rgba(255,152,0,0.4)';
    } else {
      countEl.textContent = captureCount;
      countEl.style.background = 'rgba(255,255,255,0.2)';
    }
  }

  // Create floating capture button
  function createCaptureUI() {
    // Prevent duplicate UI on SPA navigation
    if (document.getElementById('hearted-capture-ui')) return;

    const container = document.createElement('div');
    container.id = 'hearted-capture-ui';

    // Build UI with safe DOM methods
    const style = document.createElement('style');
    style.textContent = `
      #hearted-capture-ui {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #hearted-capture-btn {
        background: linear-gradient(135deg, #e91e63 0%, #9c27b0 100%);
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 24px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(233, 30, 99, 0.4);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      #hearted-capture-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(233, 30, 99, 0.5);
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
        transition: background 0.2s;
      }
    `;
    container.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'hearted-capture-btn';

    const heart = document.createElement('span');
    heart.textContent = '\u2764\uFE0F';
    btn.appendChild(heart);

    const label = document.createElement('span');
    label.id = 'hearted-label';
    label.textContent = 'Start Capture';
    btn.appendChild(label);

    const count = document.createElement('span');
    count.id = 'hearted-count';
    count.textContent = '0';
    btn.appendChild(count);

    container.appendChild(btn);
    document.body.appendChild(container);

    btn.addEventListener('click', () => {
      isCapturing = !isCapturing;

      if (isCapturing) {
        btn.classList.add('active');
        label.textContent = 'Capturing...';
        scanCount = 0;
        scanAndCapture();
      } else {
        btn.classList.remove('active');
        label.textContent = 'Start Capture';
      }
    });
  }

  // Set up scroll listener for continuous capture
  function setupScrollListener() {
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      if (!isCapturing) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(scanAndCapture, 300);
    });
  }

  // Initialize when on likes page
  function init() {
    if (isLikesPage()) {
      console.log('Hearted: Detected likes page, initializing capture UI');
      createCaptureUI();
      setupScrollListener();
    }
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also check on URL changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 1000);
    }
  }).observe(document.body, { subtree: true, childList: true });

})();

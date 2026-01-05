// Hearted - X.com Content Script
// Scrapes liked tweets as user scrolls through their likes page

(function() {
  'use strict';

  const CAPTURED_TWEETS = new Set();
  let isCapturing = false;
  let captureCount = 0;

  // Check if we're on a likes page
  function isLikesPage() {
    return window.location.pathname.includes('/likes');
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
        if (response?.success) {
          CAPTURED_TWEETS.add(tweetData.url);
          captureCount++;
          updateBadge();
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }

  // Scan visible tweets and capture new ones
  async function scanAndCapture() {
    if (!isCapturing) return;

    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    for (const article of articles) {
      const tweetData = extractTweetData(article);
      if (tweetData) {
        try {
          await captureTweet(tweetData);
          // Add visual indicator
          article.style.borderLeft = '3px solid #e91e63';
        } catch (e) {
          console.error('Hearted: Failed to capture tweet', e);
        }
      }
    }
  }

  // Update extension badge with capture count
  function updateBadge() {
    browser.runtime.sendMessage({
      action: 'updateBadge',
      count: captureCount
    });
  }

  // Create floating capture button
  function createCaptureUI() {
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
        }
      </style>
      <button id="hearted-capture-btn">
        <span>❤️</span>
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

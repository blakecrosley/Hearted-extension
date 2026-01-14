// Hearted - Instagram Content Script
// Captures images from Instagram likes grid and individual posts

(function() {
  'use strict';

  const PROCESSED_POSTS = new Set();
  let enrichCount = 0;
  let processed = 0;
  let isCapturing = false;

  // Extract shortcode from URL
  function getShortcode() {
    const match = window.location.pathname.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  // Check if we're on a post page
  function isPostPage() {
    return /\/(?:p|reel|tv)\/[A-Za-z0-9_-]+/.test(window.location.pathname);
  }

  // Check if we're on the likes activity page
  function isLikesPage() {
    return window.location.pathname.includes('/your_activity/interactions/likes');
  }

  // Extract image URLs from the page
  function extractImages() {
    const images = [];

    // Main post images
    document.querySelectorAll('article img').forEach(img => {
      const src = img.src;
      if (src && !src.includes('profile') && !src.includes('44x44') && !src.includes('150x150')) {
        // Get highest quality version
        const highQuality = src.replace(/\/s\d+x\d+\//, '/s1080x1080/');
        if (!images.includes(highQuality)) {
          images.push(highQuality);
        }
      }
    });

    // Also check for srcset
    document.querySelectorAll('article img[srcset]').forEach(img => {
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        // Parse srcset and get largest image
        const sources = srcset.split(',').map(s => {
          const parts = s.trim().split(' ');
          return { url: parts[0], size: parseInt(parts[1]) || 0 };
        });
        sources.sort((a, b) => b.size - a.size);
        if (sources.length > 0 && !images.includes(sources[0].url)) {
          images.push(sources[0].url);
        }
      }
    });

    // Video thumbnail
    const video = document.querySelector('article video');
    if (video && video.poster) {
      if (!images.includes(video.poster)) {
        images.push(video.poster);
      }
    }

    return images;
  }

  // Extract video URL if available
  function extractVideo() {
    const video = document.querySelector('article video');
    if (video && video.src) {
      return video.src;
    }
    return null;
  }

  // Get the author username
  function extractAuthor() {
    // Try to find author link
    const authorLink = document.querySelector('article header a[href^="/"]');
    if (authorLink) {
      return authorLink.getAttribute('href').replace(/^\/|\/$/g, '');
    }
    return null;
  }

  // Send to background for API call
  async function updateItem(postData) {
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage({
        action: 'updateInstagramImage',
        data: postData
      }, response => {
        if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }

  // Process the current post
  async function processPost() {
    const shortcode = getShortcode();
    if (!shortcode || PROCESSED_POSTS.has(shortcode)) {
      return;
    }

    PROCESSED_POSTS.add(shortcode);

    const images = extractImages();
    if (images.length === 0) {
      console.log('Hearted: No images found on this post');
      return;
    }

    const postUrl = window.location.href.split('?')[0];
    const author = extractAuthor();
    const video = extractVideo();
    const isReel = window.location.pathname.includes('/reel/');

    const postData = {
      url: postUrl,
      shortcode: shortcode,
      images: images,
      image_url: images[0],
      video_url: video,
      author: author,
      content_type: isReel ? 'reel' : (video ? 'video' : 'post')
    };

    console.log('Hearted: Processing Instagram post', postData);

    try {
      const result = await updateItem(postData);
      if (result?.updated) {
        enrichCount++;
        showSuccessIndicator();
        console.log('Hearted: Successfully enriched item');
      } else if (result?.not_found) {
        console.log('Hearted: Post not in database (not previously liked)');
      } else if (result?.already_has_image) {
        console.log('Hearted: Item already has an image');
      }
    } catch (e) {
      console.error('Hearted: Failed to update item', e);
    }
  }

  // Show success indicator
  function showSuccessIndicator() {
    // Check if indicator already exists
    if (document.getElementById('hearted-success')) {
      return;
    }

    const indicator = document.createElement('div');
    indicator.id = 'hearted-success';
    indicator.innerHTML = `
      <style>
        #hearted-success {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 99999;
          background: linear-gradient(135deg, #e91e63 0%, #9c27b0 100%);
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(233, 30, 99, 0.4);
          animation: heartedSlideIn 0.3s ease-out, heartedFadeOut 0.3s ease-in 2.7s forwards;
        }
        @keyframes heartedSlideIn {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes heartedFadeOut {
          to { opacity: 0; transform: translateY(-10px); }
        }
      </style>
      <span>Image saved to Hearted</span>
    `;

    document.body.appendChild(indicator);

    // Remove after animation
    setTimeout(() => {
      indicator.remove();
    }, 3000);
  }

  // Wait for content to load
  function waitForContent(callback, maxAttempts = 10) {
    let attempts = 0;

    const check = () => {
      attempts++;
      const hasImages = document.querySelectorAll('article img').length > 0;

      if (hasImages) {
        callback();
      } else if (attempts < maxAttempts) {
        setTimeout(check, 500);
      }
    };

    check();
  }

  // Initialize
  function init() {
    if (isLikesPage()) {
      initLikesPage();
    } else if (isPostPage()) {
      console.log('Hearted: Detected Instagram post page');
      waitForContent(processPost);
    }
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===========================================
  // LIKES GRID SCRAPING (Your Activity > Likes)
  // ===========================================

  // Extract post data from a grid item
  function extractGridItem(item) {
    try {
      // Find the link to the post
      const link = item.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (!link) return null;

      const href = link.getAttribute('href');
      const shortcodeMatch = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
      if (!shortcodeMatch) return null;

      const shortcode = shortcodeMatch[1];
      if (PROCESSED_POSTS.has(shortcode)) return null;

      // Get the thumbnail image
      const img = item.querySelector('img');
      if (!img || !img.src) return null;

      // Get higher quality version of thumbnail
      let imageUrl = img.src;
      // Instagram thumbnails can be upgraded by changing size params
      imageUrl = imageUrl.replace(/\/s\d+x\d+\//, '/s640x640/');
      imageUrl = imageUrl.replace(/\/e\d+\//, '/e35/');

      const isReel = href.includes('/reel/');

      return {
        url: `https://www.instagram.com${href}`,
        shortcode: shortcode,
        images: [imageUrl],
        image_url: imageUrl,
        content_type: isReel ? 'reel' : 'post'
      };
    } catch (e) {
      console.error('Hearted: Error extracting grid item', e);
      return null;
    }
  }

  // Scan and capture one item at a time, re-querying DOM each time
  async function scanLikesGrid() {
    if (!isCapturing) return;

    // Re-query DOM fresh each time - this is critical after navigation
    const mainContent = document.querySelector('main[role="main"]') || document.querySelector('main');
    if (!mainContent) {
      console.log('Hearted: No main content area found');
      if (isCapturing) setTimeout(scanLikesGrid, 2000);
      return;
    }

    // Find all clickable images fresh from the DOM
    const imageButtons = mainContent.querySelectorAll('div[role="button"][aria-label="Image of Post"]');
    console.log(`Hearted: Found ${imageButtons.length} clickable post images`);

    // Find the first unprocessed item
    let targetBtn = null;
    let targetImg = null;
    let imgKey = null;

    for (const btn of imageButtons) {
      const img = btn.querySelector('img');
      if (!img || !img.src) continue;

      // Create a unique key from image src to avoid reprocessing
      const key = img.src.split('?')[0].slice(-50);
      if (PROCESSED_POSTS.has(key)) {
        continue; // Skip already processed
      }

      // Found an unprocessed item
      targetBtn = btn;
      targetImg = img;
      imgKey = key;
      break;
    }

    if (!targetBtn) {
      console.log('Hearted: No unprocessed images found in view. Scroll for more.');
      // Don't reschedule - wait for scroll event or user to scroll
      return;
    }

    console.log(`Hearted: Processing image ${imgKey.substring(0,20)}...`);

    // Mark as processed BEFORE clicking to prevent double processing
    PROCESSED_POSTS.add(imgKey);

    // Scroll element into view first
    targetBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 500));

    // Store the thumbnail URL before clicking
    const thumbnailUrl = targetImg.src;

    // Click the image to open the post
    targetBtn.click();

    // Wait for navigation
    await new Promise(r => setTimeout(r, 2000));

    // Check if URL changed to a post URL
    const currentUrl = window.location.href;
    const shortcodeMatch = currentUrl.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);

    if (shortcodeMatch) {
      const shortcode = shortcodeMatch[1];
      const isReel = currentUrl.includes('/reel/');
      console.log(`Hearted: Got shortcode: ${shortcode}, isReel: ${isReel}`);

      // Wait a bit more for content to load
      await new Promise(r => setTimeout(r, 500));

      // Get higher quality image - try multiple sources
      let imageUrl = thumbnailUrl; // fallback to thumbnail

      // Try to find image in the post page
      const articleImg = document.querySelector('article img[src*="cdninstagram"]');
      if (articleImg && articleImg.src) {
        imageUrl = articleImg.src;
        console.log(`Hearted: Found article image`);
      }

      // For videos/reels, try to get poster
      const video = document.querySelector('article video');
      if (video && video.poster) {
        imageUrl = video.poster;
        console.log(`Hearted: Using video poster`);
      }

      // Also try srcset images which might be higher quality
      const srcsetImg = document.querySelector('article img[srcset]');
      if (srcsetImg) {
        const srcset = srcsetImg.getAttribute('srcset');
        if (srcset) {
          const sources = srcset.split(',').map(s => s.trim().split(' ')[0]);
          if (sources.length > 0) {
            imageUrl = sources[sources.length - 1];
            console.log(`Hearted: Using srcset image`);
          }
        }
      }

      console.log(`Hearted: Final imageUrl: ${imageUrl.substring(0, 80)}...`);

      const postData = {
        url: currentUrl.split('?')[0],
        shortcode: shortcode,
        images: [imageUrl],
        image_url: imageUrl,
        content_type: isReel ? 'reel' : 'post'
      };

      try {
        const result = await updateItem(postData);
        processed++;

        if (result?.created) {
          enrichCount++;
          updateCountDisplay();
          console.log(`Hearted: ★ Created new item ${shortcode}`);
        } else if (result?.updated) {
          enrichCount++;
          updateCountDisplay();
          console.log(`Hearted: ✓ Updated ${shortcode}`);
        } else if (result?.not_found) {
          console.log(`Hearted: ✗ Not in database - ${shortcode}`);
        } else if (result?.already_has_image) {
          console.log(`Hearted: ○ Already has image - ${shortcode}`);
        }
      } catch (e) {
        console.error('Hearted: Failed to update', e);
      }

      // Go back to likes page
      console.log(`Hearted: Navigating back...`);
      history.back();

      // Wait for page to fully load after navigating back
      await new Promise(r => setTimeout(r, 2000));
      console.log(`Hearted: Back on likes page`);

    } else {
      // Didn't navigate - maybe a modal or failed click
      console.log(`Hearted: Click didn't navigate to post`);

      // Try to close any modal
      const closeBtn = document.querySelector('svg[aria-label="Close"]')?.closest('button');
      if (closeBtn) {
        closeBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Schedule next item if still capturing
    if (isCapturing) {
      console.log(`Hearted: Scheduling next capture... (Total: ${processed})`);
      setTimeout(scanLikesGrid, 1000);
    }
  }

  // Update count display
  function updateCountDisplay() {
    const countEl = document.getElementById('hearted-count');
    if (countEl) {
      countEl.textContent = enrichCount;
    }
  }

  // Create capture UI for likes page
  function createLikesCaptureUI() {
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

    btn.addEventListener('click', () => {
      isCapturing = !isCapturing;

      if (isCapturing) {
        btn.classList.add('active');
        label.textContent = 'Capturing...';
        scanLikesGrid();
      } else {
        btn.classList.remove('active');
        label.textContent = 'Start Capture';
      }
    });
  }

  // Set up scroll listener for likes grid
  function setupLikesScrollListener() {
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      if (!isCapturing) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(scanLikesGrid, 300);
    });
  }

  // Initialize for likes page
  function initLikesPage() {
    console.log('Hearted: Detected Instagram likes page, initializing capture UI');
    createLikesCaptureUI();
    setupLikesScrollListener();
  }

  // Watch for SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 1000);
    }
  }).observe(document.body, { subtree: true, childList: true });

})();

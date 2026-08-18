'use strict';

function createReviewsPageClient({ fetchImpl = fetch } = {}) {
  return {
    async fetch(url, options = {}, timeoutMs = 12000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetchImpl(url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBuddyBot/1.0)' },
          signal: controller.signal,
          ...options,
        });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

module.exports = { createReviewsPageClient };

'use strict';

const { ttlCache } = require('../../../../lib/ttl-cache');

function registerReviewsRoutes(app, { getReviewsStats, logger = console }) {
  const getCachedReviewsStats = ttlCache(getReviewsStats, { ttlMs: 5 * 60 * 1000 });

  app.get('/api/reviews-stats', async (_req, res) => {
    try {
      res.json({ success: true, ...await getCachedReviewsStats() });
    } catch (error) {
      logger.error('[Reviews] stats failed:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerReviewsRoutes };

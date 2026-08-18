'use strict';

const { createGetReviewsStats } = require('./application/get-reviews-stats');
const { registerReviewsRoutes } = require('./http/register-reviews-routes');
const { createReviewsPageClient } = require('./infrastructure/reviews-page-client');
const { createReviewsSnapshotRepository } = require('./infrastructure/reviews-snapshot-repository');

function registerReviewsFeature(app, { dataDir, reviewsUrl }) {
  const getReviewsStats = createGetReviewsStats({
    baseUrl: reviewsUrl,
    pageClient: createReviewsPageClient(),
    snapshotRepository: createReviewsSnapshotRepository({ dataDir }),
  });

  registerReviewsRoutes(app, { getReviewsStats });
}

module.exports = { registerReviewsFeature };

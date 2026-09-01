'use strict';

function registerProfileRoutes(app, options) {
  const {
    requireOwner,
    brandDefaults,
    brandState,
    saveBrand,
    storageReadiness,
    businessProfile,
    saveBusinessProfile,
    now = () => new Date().toISOString(),
    onBusinessSaveError = error => console.error('[Business Profile] save failed:', error.message),
  } = options;

  app.get('/api/brand-profile', (req, res) => {
    res.json({
      success: true,
      brand: brandState.profile,
      defaults: brandDefaults,
      reviewedAt: brandState.reviewedAt,
    });
  });

  app.post('/api/brand-profile', requireOwner, (req, res) => {
    const incoming = req.body && req.body.brand;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ success: false, error: 'No brand profile supplied.' });
    }

    // Merge onto defaults so a partial save can never blank out the whole voice.
    brandState.profile = { ...brandDefaults, ...brandState.profile, ...incoming };
    brandState.reviewedAt = now();
    const persisted = saveBrand();
    return res.json({
      success: true,
      brand: brandState.profile,
      reviewedAt: brandState.reviewedAt,
      persisted,
      durable: persisted && storageReadiness().persistent,
    });
  });

  app.post('/api/brand-profile/reset', requireOwner, (req, res) => {
    brandState.profile = JSON.parse(JSON.stringify(brandDefaults));
    brandState.reviewedAt = null;
    const persisted = saveBrand();
    return res.json({
      success: true,
      brand: brandState.profile,
      reviewedAt: brandState.reviewedAt,
      persisted,
      durable: persisted && storageReadiness().persistent,
    });
  });

  app.get('/api/business-profile', (req, res) => {
    res.json({ success: true, profile: businessProfile() });
  });

  app.post('/api/business-profile', requireOwner, (req, res) => {
    try {
      saveBusinessProfile(req.body || {});
      return res.json({ success: true, profile: businessProfile() });
    } catch (error) {
      onBusinessSaveError(error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerProfileRoutes };

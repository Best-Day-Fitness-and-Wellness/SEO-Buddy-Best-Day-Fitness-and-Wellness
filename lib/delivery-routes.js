'use strict';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function registerDeliveryRoutes(app, options) {
  const {
    requireAuth,
    gmailClient,
    gmailSender,
    sendGmail,
    gbpConfigured,
    postGbpLocalPost,
    getGbpDraft,
    markGbpDraftPosted,
    defaultDigestRecipient,
    getDigest,
    saveNewDigest,
    buildDigest,
    logger = console,
  } = options;

  app.get('/api/gmail-status', (req, res) => {
    res.json({ configured: !!gmailClient(), from: gmailSender() });
  });

  app.post('/api/send-pitch', requireAuth, async (req, res) => {
    const { to, subject, body } = req.body || {};
    if (!gmailClient()) {
      return res.json({
        success: true,
        needsSetup: true,
        message: 'Gmail direct-send isn’t connected yet — use the compose window. Add GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN in Railway to enable one-click send.',
      });
    }
    if (!to || !EMAIL_PATTERN.test(String(to).trim())) {
      return res.status(400).json({ success: false, error: 'Enter a valid recipient email address to send.' });
    }
    try {
      const id = await sendGmail(to, subject, body);
      return res.json({ success: true, sent: true, id });
    } catch (error) {
      logger.error('[Gmail send] failed:', error.message);
      return res.status(502).json({ success: false, error: `Gmail send failed: ${error.message}` });
    }
  });

  app.get('/api/gbp-status', (req, res) => {
    res.json({ configured: gbpConfigured() });
  });

  app.post('/api/gbp-post', requireAuth, async (req, res) => {
    const draft = getGbpDraft();
    const text = (req.body && req.body.text) || (draft && draft.text);
    if (!text) return res.status(400).json({ success: false, error: 'No post text to publish.' });
    if (!gbpConfigured()) {
      return res.json({
        success: true,
        needsSetup: true,
        message: 'Google Business Profile posting isn’t connected. It needs approved Business Profile API access plus the GBP_* env vars.',
      });
    }
    try {
      const result = await postGbpLocalPost(text);
      const currentDraft = getGbpDraft();
      if (currentDraft && currentDraft.text === text) markGbpDraftPosted();
      return res.json({ success: true, ...result });
    } catch (error) {
      logger.error('[GBP post] failed:', error.message);
      return res.status(502).json({ success: false, error: `GBP post failed: ${error.message}` });
    }
  });

  app.post('/api/gbp-mark-posted', requireAuth, (req, res) => {
    if (!getGbpDraft()) return res.json({ success: true, note: 'No current post to mark.' });
    markGbpDraftPosted();
    return res.json({ success: true });
  });

  app.post('/api/performance-digest/send', requireAuth, async (req, res) => {
    const to = ((req.body && req.body.to) || defaultDigestRecipient() || '').trim();
    if (!gmailClient()) {
      return res.json({
        success: true,
        needsSetup: true,
        message: 'Connect Gmail (see the OAuth setup guide) to email the digest.',
      });
    }
    if (!EMAIL_PATTERN.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'No recipient email. Set GMAIL_SENDER or DIGEST_EMAIL in Railway, or enter one.',
      });
    }
    try {
      let digest = getDigest();
      if (!digest) {
        digest = await buildDigest();
        saveNewDigest(digest);
      }
      const id = await sendGmail(to, 'Your weekly SEO performance — Best Day Fitness', digest.text);
      return res.json({ success: true, sent: true, id, to });
    } catch (error) {
      return res.status(502).json({ success: false, error: error.message });
    }
  });
}

module.exports = { EMAIL_PATTERN, registerDeliveryRoutes };

'use strict';

const MEDIA_MAX_MB = 18;
const MEDIA_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4',
  'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/flac',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/mpeg',
];
const DEFAULT_SOCIAL_PLATFORMS = [
  'Instagram', 'TikTok', 'Facebook', 'Threads', 'Bluesky', 'LinkedIn', 'YouTube Shorts',
];

function normalizeMediaType(mimeType) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase();
}

function estimatedDecodedBytes(data) {
  return Math.floor(String(data).length * 0.75);
}

function buildTranscriptionRequest(data, mimeType, model) {
  return {
    model,
    contents: [{
      parts: [
        { inlineData: { mimeType, data } },
        { text: `Transcribe this recording verbatim.
Keep the speaker's own words, filler and all — this is raw source material for an
article, and the specifics and turns of phrase are the whole point. Do not
summarise, tidy up, or add commentary. Return only the transcript text.` },
      ],
    }],
  };
}

function buildSocialPackPrompt(businessName, transcript, ideaIndex, hookIndex) {
  return `Here is a transcript of ${businessName} answering a customer question:

"""
${String(transcript).slice(0, 60000)}
"""

Give me 5 ideas for short-form videos based on this transcript.

Then give me 5 hooks for idea ${(Number(ideaIndex) || 1)}. Make sure they have stakes to hook
the viewer in and make them want to keep watching.

Then write me a script for hook ${(Number(hookIndex) || 1)} for a 30 second video, and make sure
you include personal stories and specifics from the transcript — not generic advice.

Return ONLY raw JSON, no markdown fences:
{"ideas":["..."],"hooks":["..."],"script":"the spoken script, plain text, no stage directions","platforms":["Instagram","TikTok","Facebook","Threads","Bluesky","LinkedIn","YouTube Shorts"]}`;
}

function shapeSocialPack(pack, ideaIndex, hookIndex) {
  return {
    success: true,
    ideas: (pack.ideas || []).slice(0, 5),
    hooks: (pack.hooks || []).slice(0, 5),
    script: pack.script,
    ideaIndex: Number(ideaIndex) || 1,
    hookIndex: Number(hookIndex) || 1,
    platforms: Array.isArray(pack.platforms) && pack.platforms.length
      ? pack.platforms
      : DEFAULT_SOCIAL_PLATFORMS,
  };
}

function registerRecordedContentRoutes(app, options) {
  const {
    requireAuth,
    usageOverBudget,
    budgetBlock,
    geminiGenerate,
    model,
    businessName,
    parseGeminiJson,
    logger = console,
  } = options;

  app.post('/api/transcribe', requireAuth, async (req, res) => {
    try {
      const { data, mimeType } = req.body || {};
      if (!data) return res.status(400).json({ success: false, error: 'No recording received.' });

      const normalizedType = normalizeMediaType(mimeType);
      if (!MEDIA_TYPES.includes(normalizedType)) {
        return res.status(400).json({ success: false, error: `Unsupported file type "${mimeType || 'unknown'}". Use an audio or video recording (m4a, mp3, wav, mp4, mov).` });
      }

      const bytes = estimatedDecodedBytes(data);
      if (bytes > MEDIA_MAX_MB * 1048576) {
        return res.status(413).json({
          success: false,
          error: `That file is ${(bytes / 1048576).toFixed(1)}MB. The limit is ${MEDIA_MAX_MB}MB — record audio only instead of video, or trim it. A 10-minute voice memo is usually about 5MB.`,
        });
      }

      if (usageOverBudget()) return budgetBlock(res);
      const result = await geminiGenerate(
        buildTranscriptionRequest(data, normalizedType, model),
        { usageKind: 'transcribe' },
      );
      const transcript = String(result.text || '').trim();
      if (!transcript) throw new Error('Nothing came back from the transcription — try a shorter or clearer recording.');

      return res.json({
        success: true,
        transcript,
        words: transcript.split(/\s+/).filter(Boolean).length,
      });
    } catch (error) {
      logger.error('[Transcribe] failed:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/social-pack', requireAuth, async (req, res) => {
    try {
      const { transcript, ideaIndex, hookIndex } = req.body || {};
      if (!transcript || transcript.trim().length < 200) {
        return res.status(400).json({ success: false, error: 'Need a transcript of at least a couple of paragraphs.' });
      }
      if (usageOverBudget()) return budgetBlock(res);

      const result = await geminiGenerate({
        model,
        contents: buildSocialPackPrompt(businessName, transcript, ideaIndex, hookIndex),
      }, { usageKind: 'social' });
      const pack = parseGeminiJson(result.text) || {};
      if (!pack.script) throw new Error('Gemini did not return a usable script — try again.');

      return res.json(shapeSocialPack(pack, ideaIndex, hookIndex));
    } catch (error) {
      logger.error('[Social pack] failed:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = {
  DEFAULT_SOCIAL_PLATFORMS,
  MEDIA_MAX_MB,
  MEDIA_TYPES,
  buildSocialPackPrompt,
  buildTranscriptionRequest,
  estimatedDecodedBytes,
  normalizeMediaType,
  registerRecordedContentRoutes,
  shapeSocialPack,
};

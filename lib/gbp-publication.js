'use strict';

function recordGbpPublication(draft, result, now = () => new Date().toISOString()) {
  if (!draft) return;
  const verified = result?.posted === true && typeof result.name === 'string' && !!result.name.trim();
  if (result && !verified) throw new Error('Google did not confirm the post.');
  // Manual marking must never overwrite a previously recorded Google receipt.
  if (!result && draft.publicationSource === 'google-api' && draft.googlePostName) return;
  draft.posted = true;
  draft.postedAt = now();
  draft.publicationSource = verified ? 'google-api' : 'owner';
  if (verified) draft.googlePostName = result.name;
  delete draft.postError;
}

function gbpPublicationStatus(draft) {
  if (!draft) return 'none';
  if (!draft?.posted) return 'draft';
  return draft.publicationSource === 'google-api' && draft.googlePostName ? 'google-confirmed' : 'owner-marked';
}

module.exports = { recordGbpPublication, gbpPublicationStatus };

'use strict';

function createGoogleDelivery(options) {
  const {
    google,
    providerRuntime,
    siteDomain,
    env = process.env,
  } = options;

  function gmailClient() {
    const id = env.GMAIL_CLIENT_ID;
    const secret = env.GMAIL_CLIENT_SECRET;
    const refresh = env.GMAIL_REFRESH_TOKEN;
    if (!id || !secret || !refresh) return null;
    const auth = new google.auth.OAuth2(id, secret, 'https://developers.google.com/oauthplayground');
    auth.setCredentials({ refresh_token: refresh });
    return google.gmail({ version: 'v1', auth });
  }

  async function sendGmail(to, subject, body) {
    const gmail = gmailClient();
    if (!gmail) throw new Error('Gmail is not connected.');
    const headers = [
      `To: ${String(to).trim()}`,
      env.GMAIL_SENDER ? `From: ${env.GMAIL_SENDER}` : null,
      `Subject: ${subject || ''}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
    ].filter(Boolean).join('\r\n');
    const raw = Buffer.from(`${headers}\r\n\r\n${body || ''}`)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const response = await providerRuntime.run('gmail', () => gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    }), { policy: { retries: 0, timeoutMs: 30000 } });
    return response.data && response.data.id;
  }

  function gbpAuth() {
    const id = env.GBP_CLIENT_ID || env.GMAIL_CLIENT_ID;
    const secret = env.GBP_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET;
    const refresh = env.GBP_REFRESH_TOKEN;
    if (!id || !secret || !refresh) return null;
    const auth = new google.auth.OAuth2(id, secret, 'https://developers.google.com/oauthplayground');
    auth.setCredentials({ refresh_token: refresh });
    return auth;
  }

  function gbpConfigured() {
    return !!(gbpAuth() && env.GBP_ACCOUNT_ID && env.GBP_LOCATION_ID);
  }

  async function postGbpLocalPost(text) {
    const auth = gbpAuth();
    if (!auth || !env.GBP_ACCOUNT_ID || !env.GBP_LOCATION_ID) {
      return { posted: false, needsSetup: true };
    }
    const tokenObject = await auth.getAccessToken();
    const token = (tokenObject && tokenObject.token) || tokenObject;
    const url = `https://mybusiness.googleapis.com/v4/accounts/${env.GBP_ACCOUNT_ID}/locations/${env.GBP_LOCATION_ID}/localPosts`;
    const response = await providerRuntime.fetch('google-business-profile', url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        languageCode: 'en-US',
        summary: String(text || '').slice(0, 1500),
        topicType: 'STANDARD',
        callToAction: { actionType: 'LEARN_MORE', url: siteDomain() },
      }),
    }, { retries: 0 });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error && data.error.message ? data.error.message : `GBP API HTTP ${response.status}`);
    }
    return { posted: true, name: data.name, searchUrl: data.searchUrl };
  }

  return { gmailClient, sendGmail, gbpAuth, gbpConfigured, postGbpLocalPost };
}

module.exports = { createGoogleDelivery };

'use strict';

const crypto = require('node:crypto');

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function headerValue(value, label) {
  const normalized = String(value || '').trim();
  if (/[\r\n\0]/.test(normalized)) throw new TypeError(`${label} contains invalid characters.`);
  return normalized;
}

function safeFilename(value) {
  const normalized = String(value || 'attachment').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
  return (normalized || 'attachment').slice(0, 120);
}

function wrapBase64(value) {
  return value.match(/.{1,76}/g)?.join('\r\n') || '';
}

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

  async function sendGmail(to, subject, body, options = {}) {
    const gmail = gmailClient();
    if (!gmail) throw new Error('Gmail is not connected.');
    const recipient = headerValue(to, 'Recipient');
    const sender = env.GMAIL_SENDER ? headerValue(env.GMAIL_SENDER, 'Sender') : '';
    const title = headerValue(subject, 'Subject');
    const attachments = Array.isArray(options.attachments) ? options.attachments : [];
    const headers = [
      `To: ${recipient}`,
      sender ? `From: ${sender}` : null,
      `Subject: ${title}`,
      'MIME-Version: 1.0',
    ].filter(Boolean);
    let message;
    if (!attachments.length) {
      headers.push('Content-Type: text/plain; charset=UTF-8');
      message = `${headers.join('\r\n')}\r\n\r\n${body || ''}`;
    } else {
      const boundary = `seo-buddy-${crypto.randomBytes(18).toString('hex')}`;
      headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      const parts = [
        `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body || ''}`,
      ];
      for (const attachment of attachments) {
        const data = Buffer.isBuffer(attachment?.data) ? attachment.data : Buffer.from(attachment?.data || '');
        if (!data.length) throw new TypeError('Email attachment is empty.');
        if (data.length > MAX_ATTACHMENT_BYTES) throw new RangeError('Email attachment exceeds the 10 MB safety limit.');
        const filename = safeFilename(attachment.filename);
        const contentType = headerValue(attachment.contentType || 'application/octet-stream', 'Attachment content type');
        parts.push(`--${boundary}\r\nContent-Type: ${contentType}; name="${filename}"\r\nContent-Disposition: attachment; filename="${filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapBase64(data.toString('base64'))}`);
      }
      parts.push(`--${boundary}--`);
      message = `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
    }
    const raw = Buffer.from(message)
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

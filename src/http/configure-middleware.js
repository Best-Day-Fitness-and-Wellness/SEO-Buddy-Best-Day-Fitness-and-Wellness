'use strict';

const path = require('node:path');
const bodyParser = require('body-parser');
const compression = require('compression');
const cors = require('cors');
const express = require('express');
const { securityHeaders } = require('./middleware/security-headers');

/** Configure the shared HTTP pipeline in its legacy order. */
function configureMiddleware(app, { allowedOrigin, publicDir }) {
  if (allowedOrigin) {
    app.use(cors({ origin: allowedOrigin.split(',').map(value => value.trim()) }));
  }

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(compression({ threshold: 1024 }));
  app.use('/api/transcribe', bodyParser.json({ limit: '34mb' }));
  app.use(bodyParser.json());
  app.use(express.static(publicDir, {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (path.basename(filePath) === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
      }
    },
  }));
}

module.exports = { configureMiddleware };

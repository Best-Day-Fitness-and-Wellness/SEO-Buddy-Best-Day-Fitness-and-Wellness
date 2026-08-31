'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function buildBrowserAssets(publicDir, entries) {
  return entries.map(entry => {
    const filePath = path.join(publicDir, entry.file);
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
    const extension = path.extname(entry.file);
    const name = path.basename(entry.file, extension);
    return {
      token: entry.token,
      file: entry.file,
      filePath,
      url: `/assets/${name}.${hash}${extension}`,
    };
  });
}

function renderAssetIndex(template, assets) {
  let html = String(template);
  for (const asset of assets) html = html.replaceAll(`{{${asset.token}}}`, asset.url);
  const unresolved = html.match(/{{[A-Z0-9_]+}}/g);
  if (unresolved) throw new Error(`Unresolved browser asset token(s): ${unresolved.join(', ')}`);
  return html;
}

module.exports = { buildBrowserAssets, renderAssetIndex };

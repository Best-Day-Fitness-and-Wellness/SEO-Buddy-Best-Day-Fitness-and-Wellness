'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The browser and scheduled email intentionally share one renderer. Loading
// the vendored browser module in an isolated context prevents two report
// designs from drifting as the application evolves.
function createServerPdfReport({ publicDir, appOrigin }) {
  const jspdf = require(path.join(publicDir, 'jspdf.umd.min.js'));
  const sandbox = { jspdf, location: { origin: String(appOrigin || '') } };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(publicDir, 'jspdf.plugin.autotable.min.js'), 'utf8'), sandbox, { filename: 'jspdf.plugin.autotable.min.js' });
  vm.runInContext(fs.readFileSync(path.join(publicDir, 'modules', 'pdf-report.js'), 'utf8'), sandbox, { filename: 'pdf-report.js' });
  const report = sandbox.SeoBuddyPdfReport;
  if (!report?.buildModel || !report?.buildDocument) throw new Error('PDF report renderer did not initialize.');
  const logoPath = path.join(publicDir, 'sb-touch-180.png');
  const logo = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}` : null;

  function render(data, now = new Date()) {
    const model = report.buildModel(data, now);
    const filename = `${model.businessName.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}-Visibility-Growth-Report-${model.generatedAt.slice(0, 10)}.pdf`;
    const bytes = Buffer.from(report.buildDocument(model, logo).output('arraybuffer'));
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('PDF report renderer returned an invalid document.');
    return { filename, bytes, model };
  }

  return { render };
}

module.exports = { createServerPdfReport };

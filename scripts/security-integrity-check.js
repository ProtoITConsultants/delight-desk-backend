/**
 * Writes security-integrity-report.json with SHA-256 hashes of security-relevant files.
 * Intended for CI (e.g. deploy workflow) to evidence configuration integrity for compliance.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');

const filesToHash = [
  'src/main.ts',
  'ecosystem.config.js',
  '.github/workflows/deploy.yml',
  'package.json',
  'package-lock.json',
];

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const report = {
  generatedAt: new Date().toISOString(),
  files: {},
};

for (const relativeFile of filesToHash) {
  const absolutePath = path.join(repoRoot, relativeFile);
  if (!fs.existsSync(absolutePath)) {
    report.files[relativeFile] = { exists: false };
    continue;
  }

  const content = fs.readFileSync(absolutePath);
  report.files[relativeFile] = {
    exists: true,
    sha256: sha256(content),
    sizeBytes: content.length,
  };
}

const outputFile = path.join(repoRoot, 'security-integrity-report.json');
fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

console.log('Security integrity report generated at: security-integrity-report.json');
for (const [file, entry] of Object.entries(report.files)) {
  if (!entry.exists) {
    console.log(`MISSING  ${file}`);
    continue;
  }
  console.log(`SHA256  ${file}  ${entry.sha256}`);
}

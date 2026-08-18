const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ALLOWLIST_PATH = path.join(__dirname, '..', 'security-audit-allowlist.json');
const GHSA_PATTERN = /GHSA-[0-9a-z-]+/i;

function collectObservedAdvisories(report) {
  const observed = new Map();

  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities || {})) {
    for (const via of vulnerability.via || []) {
      if (typeof via === 'string') continue;
      const id = String(via.url || '').match(GHSA_PATTERN)?.[0]?.toUpperCase();
      if (!id) continue;
      const current = observed.get(id) || { packages: new Set(), severity: via.severity };
      current.packages.add(packageName);
      observed.set(id, current);
    }
  }

  return observed;
}

function evaluateAudit(report, allowlist, today = new Date()) {
  if (report.error) {
    return { ok: false, errors: [`npm audit failed: ${report.error.summary || 'unknown error'}`] };
  }

  const errors = [];
  const observed = collectObservedAdvisories(report);
  const acceptedIds = new Set(Object.keys(allowlist.advisories || {}).map((id) => id.toUpperCase()));
  const observedIds = new Set(observed.keys());

  const reviewBy = new Date(`${allowlist.reviewBy}T23:59:59Z`);
  if (Number.isNaN(reviewBy.valueOf()) || today > reviewBy) {
    errors.push(`dependency risk acceptance expired on ${allowlist.reviewBy}`);
  }

  for (const id of observedIds) {
    if (!acceptedIds.has(id)) errors.push(`unaccepted advisory: ${id}`);
  }
  for (const id of acceptedIds) {
    if (!observedIds.has(id)) errors.push(`stale allowlist entry must be removed: ${id}`);
  }

  const total = report.metadata?.vulnerabilities?.total || 0;
  if (total > 0 && observed.size === 0) {
    errors.push('audit reported vulnerable packages without identifiable advisory IDs');
  }

  return { ok: errors.length === 0, errors, observed };
}

function main() {
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const spawnOptions = {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  };
  const result = process.platform === 'win32'
    ? spawnSync('npm audit --omit=dev --json', { ...spawnOptions, shell: true })
    : spawnSync('npm', ['audit', '--omit=dev', '--json'], spawnOptions);

  if (result.error || !result.stdout) {
    console.error(`Unable to run npm audit: ${result.error?.message || 'no JSON output'}`);
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error('Unable to parse npm audit JSON output.');
    process.exit(1);
  }

  const evaluation = evaluateAudit(report, allowlist);
  const counts = report.metadata?.vulnerabilities || {};
  console.log(
    `Production audit: ${counts.total || 0} vulnerable package nodes ` +
      `(${counts.high || 0} high, ${counts.moderate || 0} moderate); ` +
      `${evaluation.observed?.size || 0} documented advisory IDs.`,
  );

  if (!evaluation.ok) {
    for (const error of evaluation.errors) console.error(error);
    process.exit(1);
  }

  console.log(`All residual advisories are documented through ${allowlist.reviewBy}.`);
}

if (require.main === module) main();

module.exports = { collectObservedAdvisories, evaluateAudit };

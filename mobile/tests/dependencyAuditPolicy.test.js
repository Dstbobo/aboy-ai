const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateAudit } = require('../scripts/verifyDependencyRisk');

const acceptedId = 'GHSA-aaaa-bbbb-cccc';
const report = {
  vulnerabilities: {
    dependency: {
      via: [{ url: `https://github.com/advisories/${acceptedId}`, severity: 'high' }],
    },
    wrapper: { via: ['dependency'], severity: 'high' },
  },
  metadata: { vulnerabilities: { total: 2, high: 2, moderate: 0 } },
};
const allowlist = {
  reviewBy: '2099-01-01',
  advisories: { [acceptedId]: { category: 'test', control: 'test' } },
};

test('dependency audit policy accepts only an exact documented advisory set', () => {
  assert.equal(evaluateAudit(report, allowlist, new Date('2026-08-18')).ok, true);
});

test('dependency audit policy fails closed on a new advisory', () => {
  const unknownReport = structuredClone(report);
  unknownReport.vulnerabilities.dependency.via.push({
    url: 'https://github.com/advisories/GHSA-new1-new2-new3',
    severity: 'high',
  });

  const evaluation = evaluateAudit(unknownReport, allowlist, new Date('2026-08-18'));
  assert.equal(evaluation.ok, false);
  assert.match(evaluation.errors.join('\n'), /unaccepted advisory/);
});

test('dependency audit policy fails when temporary acceptance expires', () => {
  const evaluation = evaluateAudit(report, allowlist, new Date('2100-01-01'));
  assert.equal(evaluation.ok, false);
  assert.match(evaluation.errors.join('\n'), /expired/);
});

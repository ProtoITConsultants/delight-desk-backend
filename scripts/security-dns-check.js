const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const https = require('https');

const repoRoot = path.resolve(__dirname, '..');
const inventoryPath = path.join(repoRoot, 'docs', 'dns-inventory.json');
const reportPath = path.join(repoRoot, 'security-dns-report.json');

function httpsProbe(hostname) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname,
        method: 'HEAD',
        path: '/',
        timeout: 10000,
      },
      (res) => {
        resolve({
          ok: true,
          statusCode: res.statusCode || 0,
          tlsAuthorized: true,
          server: String(res.headers?.server || ''),
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', (error) => {
      resolve({
        ok: false,
        error: error.message,
      });
    });

    req.end();
  });
}

async function checkDomain(domain) {
  const result = {
    domain,
    dnsResolved: false,
    addresses: [],
    cnames: [],
    potentialDanglingCname: false,
    httpsProbe: null,
    checksPassed: false,
    issues: [],
  };

  try {
    const lookupResult = await dns.lookup(domain, { all: true });
    result.dnsResolved = Array.isArray(lookupResult) && lookupResult.length > 0;
    result.addresses = (lookupResult || []).map((entry) => entry.address);
  } catch (error) {
    result.issues.push(`DNS resolution failed: ${error.message}`);
  }

  try {
    const cnames = await dns.resolveCname(domain);
    result.cnames = cnames;

    for (const cnameTarget of cnames) {
      try {
        await dns.lookup(cnameTarget);
      } catch (error) {
        result.potentialDanglingCname = true;
        result.issues.push(
          `Potential dangling CNAME target is not resolvable: ${cnameTarget} (${error.message})`,
        );
      }
    }
  } catch {
    // No CNAME record is normal for A/AAAA direct domains.
  }

  result.httpsProbe = await httpsProbe(domain);
  if (!result.httpsProbe.ok) {
    result.issues.push(`HTTPS probe failed: ${result.httpsProbe.error}`);
  } else if (result.httpsProbe.statusCode >= 500) {
    result.issues.push(`HTTPS probe returned server error status: ${result.httpsProbe.statusCode}`);
  }

  result.checksPassed = result.issues.length === 0 && result.dnsResolved;
  return result;
}

async function main() {
  if (!fs.existsSync(inventoryPath)) {
    throw new Error(`DNS inventory not found at ${inventoryPath}`);
  }

  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const domains = Array.isArray(inventory.domains) ? inventory.domains : [];
  if (domains.length === 0) {
    throw new Error('No domains found in dns-inventory.json');
  }

  const results = [];
  for (const domain of domains) {
    results.push(await checkDomain(domain));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totalDomains: results.length,
    passedDomains: results.filter((item) => item.checksPassed).length,
    failedDomains: results.filter((item) => !item.checksPassed).length,
  };

  const report = { summary, results };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`DNS security report generated: ${path.basename(reportPath)}`);
  for (const entry of results) {
    if (entry.checksPassed) {
      console.log(`PASS ${entry.domain}`);
    } else {
      console.log(`FAIL ${entry.domain}`);
      for (const issue of entry.issues) {
        console.log(`  - ${issue}`);
      }
    }
  }

  if (summary.failedDomains > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('DNS security check failed:', error.message);
  process.exit(1);
});

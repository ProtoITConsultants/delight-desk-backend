const { execSync } = require('child_process');

function run(command) {
  return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}

function main() {
  const targetUser = process.env.AWS_IAM_USERNAME;
  if (!targetUser) {
    throw new Error('AWS_IAM_USERNAME is required (set the IAM username to validate MFA).');
  }

  const output = run(
    `aws iam list-mfa-devices --user-name "${targetUser}" --query "MFADevices[].SerialNumber" --output text`,
  );

  if (!output) {
    console.log(`FAIL: No MFA device found for IAM user ${targetUser}.`);
    process.exit(1);
  }

  const devices = output.split(/\s+/).filter(Boolean);
  console.log(`PASS: MFA configured for IAM user ${targetUser}.`);
  for (const serial of devices) {
    console.log(`MFA device: ${serial}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`IAM MFA check failed: ${error.message}`);
  process.exit(1);
}

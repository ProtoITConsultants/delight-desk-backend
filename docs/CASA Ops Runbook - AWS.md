# CASA Ops Runbook - AWS

This runbook captures operational controls that are outside direct backend code paths but required for CASA evidence.

## 1) Administrative MFA

### Objective
Ensure all AWS administrative users use MFA.

### Verification
Run with an AWS principal that can read IAM user metadata:

```bash
AWS_IAM_USERNAME=<admin-user-name> npm run security:iam-mfa-check
```

Expected result:
- `PASS: MFA configured for IAM user ...`

If failed:
- Attach a virtual or hardware MFA device in IAM.
- Re-run verification and capture output.

## 2) Encryption At Rest (EBS / DB Host Volume)

### Objective
Ensure EC2 volumes storing application/database data are encrypted.

### Verification
```bash
aws ec2 describe-instances --instance-ids <instance-id> --region <region> --query 'Reservations[0].Instances[0].BlockDeviceMappings[].Ebs.VolumeId' --output text
aws ec2 describe-volumes --volume-ids <volume-id> --region <region> --query 'Volumes[].{VolumeId:VolumeId,Encrypted:Encrypted,KmsKeyId:KmsKeyId}' --output table
```

Expected result:
- `Encrypted = true` for attached volume(s).

If unencrypted:
- Snapshot -> Copy snapshot with encryption enabled -> Create encrypted volume -> Replace old volume during maintenance window.

## 3) TLS Revocation / OCSP

### Objective
Prefer OCSP stapling where certificate chain supports it.

### Verification
```bash
openssl x509 -in /etc/letsencrypt/live/api.delightdesk.io/cert.pem -noout -ocsp_uri
echo | openssl s_client -connect api.delightdesk.io:443 -servername api.delightdesk.io -status 2>/dev/null | grep -E "OCSP response:|Verify return code"
```

Note:
- If `ocsp_uri` is empty, stapling is not available for the current cert chain.
- Document compensating controls (trusted CA, TLS 1.2/1.3, cert renewals, monitoring).

## 4) Key Material Isolation (Target State)

### Current state
- Runtime secrets are loaded from `.env` with restricted permissions.

### Target state
- Migrate secrets to AWS Secrets Manager or SSM Parameter Store.

### Migration checklist
1. Create secret entries for app credentials.
2. Grant app instance role read access only.
3. Update app bootstrap to fetch secrets securely at startup.
4. Remove secrets from `.env` in production.
5. Rotate compromised/test keys.

## Evidence Capture Guidance

For CASA package, store:
- command output logs,
- screenshots of AWS encryption/MFA settings,
- dates and operator identity,
- links to workflow artifacts (`security-dns-report`, integrity reports).

# Delight Desk Backend

## Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- npm or yarn
- PostgreSQL database

### Installation

```bash
git clone <repository-url>
cd backend_delight_desk
npm install
```

### Environment Variables

Create a `.env` file in the project root. Example:

```
DATABASE_URL=postgres://user:password@localhost:5432/dbname
SESSION_SECRET=your-session-secret
SENDGRID_API_KEY=your-sendgrid-api-key
```

### Database Setup

Generate and run migrations:

```bash
npm run db:generate
npm run db:migrate
```

Seed billing plans:

```bash
npm run seed:billing
```

### Running the Application

#### Development

```bash
npm run start:dev
```

### Code Quality

**Format code:**

```bash
npm run format
```

**Check formatting:**

```bash
npm run format:check
```

**Lint code:**

```bash
npm run lint
```

# Deployment Guide

## Overview

The application now uses **GitHub Actions** to build the application and deploy compiled artifacts to EC2, eliminating the "JavaScript heap out of memory" error.

## How It Works

### 1. **Build Phase (GitHub Actions)**
- Runs on GitHub's servers (plenty of memory)
- Installs dependencies
- Compiles TypeScript with 4GB heap allocation
- Creates deployment package with:
    - `dist/` (compiled code)
    - `package.json` & `package-lock.json`
    - `ecosystem.config.js` (PM2 config)
    - `drizzle/` (migrations)
    - Configuration files

### 2. **Deploy Phase (EC2)**
- Uploads deployment package via SCP
- Extracts files on server
- Installs **production dependencies only** (no dev deps)
- Runs database migrations
- Restarts PM2

### 3. **Verification Phase**
- Checks PM2 process status
- Shows recent logs
- Confirms successful deployment

## Deployment Triggers

Automatic deployment runs when new commits land on **`main`**, including when a pull request is **merged** into `main` (merge creates a push event). Pushes to contributor branches (`dev/nabeel`, `dev/remy`) do **not** deploy.

## Manual Deployment

**Option A — GitHub Actions UI (recommended)**  
Repo → **Actions** → **Delight Desk Deployment** → **Run workflow** → choose branch **`main`** → Run workflow.

**Option B — Git**

```bash
git checkout main
git pull origin main
git commit --allow-empty -m "chore: trigger deployment"
git push origin main
```

## Monitoring Deployment

### View GitHub Actions logs:
1. Go to: https://github.com/ProtoITConsultants/delight-desk-backend/actions
2. Click on the latest workflow run
3. Expand steps to see detailed logs

### Check server status via SSH:
```bash
ssh ubuntu@your-ec2-ip

# Check PM2 status
pm2 status

# View logs
pm2 logs delight-desk

# Check recent logs
pm2 logs delight-desk --lines 50

# Monitor in real-time
pm2 logs delight-desk --lines 0
```

## Benefits of New Approach

✅ **No more memory errors** - Building happens on GitHub with plenty of RAM
✅ **Faster deployments** - No build time on server (just extract and run)
✅ **Smaller server footprint** - Only production dependencies installed
✅ **Better reliability** - Build failures caught before deployment
✅ **Free** - GitHub Actions included in free tier

## Troubleshooting

### If deployment fails:

1. **Check GitHub Actions logs** for build errors
2. **SSH into server** and check PM2 logs:
   ```bash
   pm2 logs delight-desk --err
   ```
3. **Check disk space** on server:
   ```bash
   df -h
   ```
4. **Manually restart** if needed:
   ```bash
   cd ~/delight-desk
   pm2 restart delight-desk
   ```

### If migrations fail:

```bash
ssh ubuntu@your-ec2-ip
cd ~/delight-desk
npm run db:migrate
```

### If PM2 doesn't start:

```bash
ssh ubuntu@your-ec2-ip
cd ~/delight-desk
pm2 delete delight-desk
pm2 start ecosystem.config.js
pm2 save
```

## Efficient Log Querying Strategies

### 1. PM2 Native Commands (Basic)

```bash
# View last 100 lines of all logs
pm2 logs delight-desk --lines 100

# View only error logs
pm2 logs delight-desk --err

# View only output logs
pm2 logs delight-desk --out

# Real-time streaming (like tail -f)
pm2 logs delight-desk

# Clear all logs
pm2 flush delight-desk
```

### 2. Direct File Access (Faster for Large Logs)

Logs are stored in `logs/` directory as configured in `ecosystem.config.js`:
- `logs/delight-desk-out.log` - Standard output
- `logs/delight-desk-error.log` - Error output

```bash
# Last 100 lines
tail -n 100 logs/delight-desk-out.log

# Real-time monitoring
tail -f logs/delight-desk-out.log

# View errors only
tail -f logs/delight-desk-error.log

# Last 1000 lines from both files
tail -n 1000 logs/delight-desk-*.log
```

### 3. Search for Specific Events (Structured Logs)

The application uses structured logging with JSON objects containing event types, timestamps, and metadata:

```bash
# Search for token refresh events
grep "token_refresh" logs/delight-desk-out.log

# Search for errors
grep "error" logs/delight-desk-out.log

# Search by userId
grep "userId.*abc-123" logs/delight-desk-out.log

# Search by event type
grep "event.*token_health_check_started" logs/delight-desk-out.log

# Case-insensitive search
grep -i "failed" logs/delight-desk-error.log
```

**Common event types to search for:**
- `token_refresh_started` - Token refresh initiated
- `token_refresh_success` - Token refreshed successfully
- `token_refresh_failed` - Token refresh failed
- `token_health_check_started` - Cron job started
- `token_health_check_completed` - Cron job completed
- `account_marked_disconnected` - Account needs reconnection
- `reconnect_notification_sent` - Email sent to user

### 4. Advanced Filtering with grep + tail

```bash
# Last 100 lines with "error"
tail -n 100 logs/delight-desk-out.log | grep "error"

# Real-time monitoring of specific events
tail -f logs/delight-desk-out.log | grep "token_refresh"

# Multiple patterns (OR)
tail -f logs/delight-desk-out.log | grep -E "error|failed|disconnected"

# Show context (3 lines before and after)
grep -C 3 "token_refresh_failed" logs/delight-desk-out.log

# Count occurrences
grep -c "token_refresh_success" logs/delight-desk-out.log

# Time-based queries (logs include timestamps: YYYY-MM-DD HH:mm:ss)
grep "^2026-02-04" logs/delight-desk-out.log              # Specific date
grep "^2026-02-04 14:" logs/delight-desk-out.log          # Specific hour
awk '/2026-02-04 14:00/,/2026-02-04 15:00/' logs/delight-desk-out.log  # Time range

# Useful one-liners
# Count token refresh successes today
grep "$(date +%Y-%m-%d)" logs/delight-desk-out.log | grep -c "token_refresh_success"

# Show all unique event types
grep -o '"event":"[^"]*"' logs/delight-desk-out.log | sort | uniq

# Find all users who needed reconnection today
grep "$(date +%Y-%m-%d)" logs/delight-desk-out.log | grep "user_reconnect_needed" | grep -o '"userId":"[^"]*"'

# Get last 10 errors with context
grep -B 2 -A 2 "error" logs/delight-desk-out.log | tail -n 50
```

**Quick health check script:**

Create `logs/health-check.sh`:
```bash
#!/bin/bash
echo "=== Last 24h Summary ==="
echo "Token refreshes: $(grep -c "token_refresh_success" logs/delight-desk-out.log)"
echo "Token failures: $(grep -c "token_refresh_failed" logs/delight-desk-out.log)"
echo "Accounts disconnected: $(grep -c "account_marked_disconnected" logs/delight-desk-out.log)"
echo "Cron executions: $(grep -c "token_health_check_started" logs/delight-desk-out.log)"
echo ""
echo "=== Recent Errors ==="
tail -n 20 logs/delight-desk-error.log
```

Make it executable: `chmod +x logs/health-check.sh`

## Environment Variables

Make sure these are set on your EC2 server in `~/.bashrc` or `~/.profile`:
- `DATABASE_URL`
- `SESSION_SECRET`
- `CORS_ORIGINS`
- Any other environment-specific variables

## Rollback

To rollback to a previous version:

```bash
# On your local machine (requires permission to force-push main — use with care)
git log  # Find the commit hash
git push origin <commit-hash>:main --force

# Or SSH into server and manually rollback
ssh ubuntu@your-ec2-ip
cd ~/delight-desk
git log
git reset --hard <commit-hash>
pm2 restart delight-desk
```

## Support

If you encounter issues:
1. Check GitHub Actions logs
2. Check PM2 logs on server
3. Verify environment variables are set
4. Ensure server has enough disk space


## License

UNLICENSED

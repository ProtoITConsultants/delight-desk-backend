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

Automatic deployment happens when you push to:
- `dev` branch

## Manual Deployment

If you need to manually deploy:

```bash
# Trigger a deployment
git push origin dev

# Or force a deployment with an empty commit
git commit --allow-empty -m "Trigger deployment"
git push origin dev
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

## Environment Variables

Make sure these are set on your EC2 server in `~/.bashrc` or `~/.profile`:
- `DATABASE_URL`
- `SESSION_SECRET`
- `CORS_ORIGINS`
- Any other environment-specific variables

## Rollback

To rollback to a previous version:

```bash
# On your local machine
git log  # Find the commit hash
git push origin <commit-hash>:dev --force

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

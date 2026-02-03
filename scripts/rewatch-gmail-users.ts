/**
 * Script to re-establish Gmail watch for all connected users
 * Run this after changing Pub/Sub topic configuration
 *
 * Usage:
 * npm run build
 * node dist/scripts/rewatch-gmail-users.js
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GoogleOauthService } from '../src/modules/google-oauth/google-oauth.service';
import { GoogleOauthRepository } from '../src/database/repos/google-oauth.repository';

async function bootstrap() {
  console.log('Starting Gmail re-watch script...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'], // Reduce log verbosity
  });
  app.enableShutdownHooks();
  const googleService = app.get(GoogleOauthService);
  const googleRepo = app.get(GoogleOauthRepository);

  // Set a timeout to force exit if cleanup takes too long
  const forceExitTimeout = setTimeout(() => {
    console.log('\n⚠ Forcing exit after timeout...');
    process.exit(0);
  }, 10000); // 10 seconds timeout

  try {
    // Get all Google accounts
    const accounts = await googleRepo.getAllGoogleAccounts();
    console.log(`Found ${accounts.length} connected Google accounts\n`);

    let successCount = 0;
    let failCount = 0;

    for (const account of accounts) {
      try {
        console.log(`Re-watching Gmail for user: ${account.userId} (${account.email})`);
        await googleService.watchGmail(account.userId);
        successCount++;
        console.log(`✓ Success\n`);
      } catch (error) {
        failCount++;
        console.error(`✗ Failed for ${account.email}:`, error.message, '\n');
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total accounts: ${accounts.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failCount}`);

    if (failCount > 0) {
      console.log('\nNote: Failed accounts may need to reconnect via OAuth');
    }

    // Clear the force exit timeout
    clearTimeout(forceExitTimeout);

    // Graceful shutdown
    console.log('\nShutting down...');
    await app.close();

    // Give a moment for cleanup, then force exit
    setTimeout(() => {
      console.log('✓ Script completed successfully');
      process.exit(0);
    }, 1000);
  } catch (error) {
    clearTimeout(forceExitTimeout);
    console.error('Script failed:', error);
    await app.close();
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoogleOauthRepository } from 'src/database/repos/google-oauth.repository';
import { SendgridService } from '../sendgrid/sendgrid.service';
import { UserRepository } from 'src/database/repos/users.repository';
import { GoogleOauthService } from './google-oauth.service';

@Injectable()
export class TokenHealthService {
  private readonly logger = new Logger(TokenHealthService.name);

  constructor(
    private readonly repo: GoogleOauthRepository,
    private readonly googleOauthService: GoogleOauthService,
    private readonly sendgridService: SendgridService,
    private readonly usersRepository: UserRepository,
  ) {}

  /**
   * Cron job that runs every 6 hours to monitor token health
   * checks all connected Google accounts and refreshes expiring tokens
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async monitorTokenHealth() {
    const startTime = Date.now();
    this.logger.log({
      event: 'token_health_check_started',
      timestamp: new Date().toISOString(),
    });

    try {
      const accounts = await this.repo.getAllGoogleAccounts();

      this.logger.log({
        event: 'accounts_fetched',
        count: accounts.length,
        timestamp: new Date().toISOString(),
      });

      let refreshedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const account of accounts) {
        try {
          // Skip disconnected accounts
          if (account.status === 'disconnected') {
            skippedCount++;
            continue;
          }

          // Check if token will expire within 24 hours (1 day buffer)
          const expiryBuffer = 24 * 60 * 60 * 1000; // 24 hours
          const willExpireSoon = new Date(account.expiresAt).getTime() - expiryBuffer <= Date.now();

          if (willExpireSoon) {
            this.logger.log({
              event: 'token_expiring_soon',
              userId: account.userId,
              email: account.email,
              expiresAt: account.expiresAt,
              hoursUntilExpiry: Math.round(
                (new Date(account.expiresAt).getTime() - Date.now()) / (60 * 60 * 1000),
              ),
              timestamp: new Date().toISOString(),
            });

            // Attempt to refresh the token
            const refreshed = await this.refreshAccountToken(account);

            if (refreshed) {
              refreshedCount++;
            } else {
              failedCount++;
            }
          }
        } catch (error: any) {
          this.logger.error({
            event: 'token_health_check_error',
            userId: account.userId,
            email: account.email,
            error: error?.message || 'Unknown error',
            timestamp: new Date().toISOString(),
          });
          failedCount++;
        }
      }

      const duration = Date.now() - startTime;

      this.logger.log({
        event: 'token_health_check_completed',
        totalAccounts: accounts.length,
        refreshed: refreshedCount,
        failed: failedCount,
        skipped: skippedCount,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      this.logger.error({
        event: 'token_health_check_failed',
        error: error?.message || 'Unknown error',
        stack: error?.stack,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Refresh access token for a specific account
   */
  private async refreshAccountToken(account: any): Promise<boolean> {
    try {
      const oauth2Client = this.googleOauthService.getOAuth2Client(
        account.refreshToken,
        account.accessToken,
      );

      this.logger.log({
        event: 'token_refresh_started',
        userId: account.userId,
        email: account.email,
        timestamp: new Date().toISOString(),
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      await this.repo.updateGoogleAccount(account.userId, {
        accessToken: credentials.access_token as any,
        expiresAt: new Date(credentials.expiry_date as any),
        status: 'connected',
      });

      this.logger.log({
        event: 'token_refresh_success',
        userId: account.userId,
        email: account.email,
        newExpiresAt: new Date(credentials.expiry_date as any),
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (error: any) {
      this.logger.error({
        event: 'token_refresh_failed',
        userId: account.userId,
        email: account.email,
        error: error?.message || 'Unknown error',
        errorCode: error?.response?.status || error?.code,
        timestamp: new Date().toISOString(),
      });

      // Check if refresh token is invalid/expired
      if (this.googleOauthService.isRefreshTokenInvalid(error)) {
        // Mark account as disconnected
        await this.repo.updateGoogleAccount(account.userId, {
          status: 'disconnected',
        });

        this.logger.warn({
          event: 'account_marked_disconnected',
          userId: account.userId,
          email: account.email,
          reason: 'invalid_refresh_token',
          timestamp: new Date().toISOString(),
        });

        // Notify user to reconnect
        await this.notifyUserToReconnect(account.userId).catch((notifyError) => {
          this.logger.error({
            event: 'notification_failed',
            userId: account.userId,
            error: notifyError?.message || 'Unknown error',
            timestamp: new Date().toISOString(),
          });
        });
      }

      return false;
    }
  }

  /**
   * Notify user to reconnect their Google account
   */
  private async notifyUserToReconnect(userId: string): Promise<void> {
    try {
      const user = await this.usersRepository.findById(userId);

      if (!user || !user.email) {
        this.logger.error({
          event: 'notification_user_not_found',
          userId: userId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await this.sendgridService.sendOAuthReconnectEmail(user.email, 'google');

      this.logger.log({
        event: 'reconnect_notification_sent',
        userId: userId,
        email: user.email,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      this.logger.error({
        event: 'notification_error',
        userId: userId,
        error: error?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

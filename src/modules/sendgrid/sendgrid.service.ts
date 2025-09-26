import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

@Injectable()
export class SendgridService {
  private readonly logger = new Logger(SendgridService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      this.logger.error('SENDGRID_API_KEY not set');
    } else {
      sgMail.setApiKey(apiKey);
    }
  }

  async sendMail(to: string, subject: string, html: string) {
    const msg = {
      to,
      from: this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'no-reply@yourapp.com',
      subject,
      html,
    };

    try {
      return await sgMail.send(msg);
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}`, error?.stack || error);
      throw new ServiceUnavailableException('Unable to send email');
    }
  }

  sendPasswordResetEmail(to: string, resetToken: string) {
    const resetUrl = `${this.configService.get<string>('FRONTEND_RESET_PASSWORD_URL')}?token=${resetToken}`;
    const html = `
      <h2>Password Reset Request</h2>
      <p>Click below to reset your password:</p>
      <a href="${resetUrl}" target="_blank">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
    `;
    return this.sendMail(to, 'Password Reset Request', html);
  }
}

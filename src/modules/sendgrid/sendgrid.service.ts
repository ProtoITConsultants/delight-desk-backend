import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { ContactUsDto } from '../contact-us/dto/index.dto';

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
      from: this.configService.get<string>('SENDGRID_FROM_EMAIL') as string,
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

  async sendContactInquiryEmail(dto: ContactUsDto) {
    const supportEmail = this.configService.get<string>('CONTACT_SUPPORT_EMAIL') as string;

    const html = `
      <h2>New Contact Inquiry</h2>
      <p><strong>Name:</strong> ${dto.name}</p>
      <p><strong>Email:</strong> ${dto.email}</p>
      ${dto.subject ? `<p><strong>Subject:</strong> ${dto.subject}</p>` : ''}
      <p><strong>Inquiry:</strong></pdto.>
      <p>${dto.inquiry}</p>
    `;

    return this.sendMail(supportEmail, 'New Contact Inquiry', html);
  }

  async sendOAuthReconnectEmail(to: string, provider: 'google' | 'microsoft') {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_CONNECTIONS_PAGE_URL') ||
      'https://delightdesk.vercel.app/connections';
    const providerName = provider === 'google' ? 'Gmail' : 'Microsoft Outlook';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">${providerName} Connection Needs Attention</h2>

        <p>Hi there,</p>

        <p>We've detected that your <strong>${providerName}</strong> integration has been disconnected and needs to be reconnected.</p>

        <p><strong>Why did this happen?</strong></p>
        <ul>
          <li>Your ${providerName} access may have been revoked or expired</li>
          <li>You may have changed your ${providerName} password</li>
          <li>The connection may have been inactive for an extended period</li>
        </ul>

        <p><strong>What does this mean?</strong></p>
        <p>Your automated email responses and notifications are currently <strong>paused</strong> until you reconnect your account.</p>

        <div style="margin: 30px 0;">
          <a href="${frontendUrl}"
             style="background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Reconnect ${providerName} Now
          </a>
        </div>

        <p><strong>How to reconnect:</strong></p>
        <ol>
          <li>Click the button above to go to your Connections page</li>
          <li>Click "Connect ${providerName}"</li>
          <li>Follow the authorization prompts</li>
          <li>You're all set! Your automation will resume immediately.</li>
        </ol>

        <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          If you didn't expect this email or need assistance, please contact our support team.
        </p>

        <p style="color: #666; font-size: 14px;">
          Best regards,<br>
          The Delight Desk Team
        </p>
      </div>
    `;

    return this.sendMail(to, `Action Required: Reconnect Your ${providerName} Account`, html);
  }
}

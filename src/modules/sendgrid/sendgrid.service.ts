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
    const safeTo = this.sanitizeEmailHeaderValue(to);
    const safeSubject = this.sanitizeHeaderValue(subject);
    const msg = {
      to: safeTo,
      from: this.configService.get<string>('SENDGRID_FROM_EMAIL') as string,
      subject: safeSubject,
      html,
    };

    try {
      return await sgMail.send(msg);
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${safeTo}`, error?.stack || error);
      throw new ServiceUnavailableException('Unable to send email');
    }
  }

  sendPasswordResetEmail(to: string, resetToken: string) {
    const resetUrl = `${this.configService.get<string>('FRONTEND_RESET_PASSWORD_URL')}?token=${encodeURIComponent(resetToken)}`;
    const safeResetUrl = this.escapeHtml(resetUrl);
    const html = this.renderBrandedEmail({
      eyebrow: 'Delight Desk',
      title: 'Password Reset Request',
      intro: 'You requested a password reset for your Delight Desk account.',
      body: `
        <p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#b8bef3;">
          This link expires in <strong style="color:#ffffff;">10 minutes</strong> for security reasons.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#9ea6df;">
          If you did not request this, you can safely ignore this email and your password will stay unchanged.
        </p>
      `,
      ctaText: 'Reset Password',
      ctaUrl: safeResetUrl,
    });
    return this.sendMail(to, 'Password Reset Request', html);
  }

  async sendContactInquiryEmail(dto: ContactUsDto) {
    const supportEmail = this.configService.get<string>('CONTACT_SUPPORT_EMAIL') as string;
    const safeName = this.escapeHtml(dto.name);
    const safeEmail = this.escapeHtml(dto.email);
    const safeSubject = dto.subject ? this.escapeHtml(dto.subject) : null;
    const safeInquiry = this.escapeHtml(dto.inquiry);

    const html = this.renderBrandedEmail({
      eyebrow: 'Delight Desk',
      title: 'New Contact Inquiry',
      intro: 'A new contact form inquiry has been submitted.',
      body: `
        <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#d8dcff;"><strong style="color:#ffffff;">Name:</strong> ${safeName}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#d8dcff;"><strong style="color:#ffffff;">Email:</strong> ${safeEmail}</p>
        ${safeSubject ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#d8dcff;"><strong style="color:#ffffff;">Subject:</strong> ${safeSubject}</p>` : ''}
        <div style="margin-top:14px;padding:14px;background:#0f1238;border:1px solid #2b2f66;border-radius:10px;">
          <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#aeb6ef;"><strong style="color:#ffffff;">Inquiry</strong></p>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#d8dcff;">${safeInquiry}</p>
        </div>
      `,
    });

    return this.sendMail(supportEmail, 'New Contact Inquiry', html);
  }

  async sendOAuthReconnectEmail(to: string, provider: 'google' | 'microsoft') {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_CONNECTIONS_PAGE_URL') ||
      'https://delightdesk.vercel.app/connections';
    const providerName = provider === 'google' ? 'Gmail' : 'Microsoft Outlook';
    const safeFrontendUrl = this.escapeHtml(frontendUrl);

    const html = this.renderBrandedEmail({
      eyebrow: 'Delight Desk',
      title: `${providerName} Connection Needs Attention`,
      intro: `We detected that your ${providerName} integration has been disconnected and needs to be reconnected.`,
      body: `
        <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#d8dcff;">
          Your automated responses and notifications are currently <strong style="color:#ffffff;">paused</strong> until you reconnect your account.
        </p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#aeb6ef;"><strong style="color:#ffffff;">Why this can happen:</strong></p>
        <ul style="margin:0 0 14px 18px;padding:0;color:#cfd4ff;font-size:13px;line-height:1.7;">
          <li>Your ${providerName} access was revoked or expired</li>
          <li>You changed your ${providerName} account password</li>
          <li>The connection was inactive for a long period</li>
        </ul>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#9ea6df;">
          If this was not expected, please contact support.
        </p>
      `,
      ctaText: `Reconnect ${providerName}`,
      ctaUrl: safeFrontendUrl,
    });

    return this.sendMail(to, `Action Required: Reconnect Your ${providerName} Account`, html);
  }

  private renderBrandedEmail(params: {
    eyebrow: string;
    title: string;
    intro: string;
    body: string;
    ctaText?: string;
    ctaUrl?: string;
  }): string {
    const ctaSection =
      params.ctaText && params.ctaUrl
        ? `
          <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:20px 0 22px;">
            <tr>
              <td align="center" style="border-radius:10px;background:linear-gradient(90deg,#8f3cff 0%,#ff4fa1 100%);">
                <a href="${params.ctaUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">
                  ${params.ctaText}
                </a>
              </td>
            </tr>
          </table>
        `
        : '';

    return `
      <div style="margin:0;padding:0;background:#f5f7ff;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#f5f7ff;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:620px;background:#121642;border:1px solid #2b2f66;border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;color:#eef0ff;">
                <tr>
                  <td style="padding:28px 28px 18px;background:linear-gradient(135deg,#261757 0%,#3a1f91 55%,#8f3cff 100%);">
                    <p style="margin:0 0 8px;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#c7b9ff;">${params.eyebrow}</p>
                    <h1 style="margin:0;font-size:26px;line-height:1.2;color:#ffffff;">${params.title}</h1>
                    <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#ece7ff;">
                      ${params.intro}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:26px 28px 30px;">
                    ${ctaSection}
                    ${params.body}
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px 24px;border-top:1px solid #2b2f66;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#8d95cf;">
                      Delight Desk - Automate support with AI that feels human.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  /** Strip newlines from header-shaped strings to reduce SMTP header-injection risk. */
  private sanitizeHeaderValue(value: string): string {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim();
  }

  /** Restrict `to` to characters valid in a single mailbox header token. */
  private sanitizeEmailHeaderValue(value: string): string {
    return this.sanitizeHeaderValue(value).replace(/[^\w@.+\-]/g, '');
  }

  /** Escape user-supplied contact fields embedded in HTML notification emails. */
  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

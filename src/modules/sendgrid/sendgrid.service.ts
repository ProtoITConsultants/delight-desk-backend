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
}

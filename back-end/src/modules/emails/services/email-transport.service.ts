import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { SendEmailDto } from '../dto/send-email.dto';

@Injectable()
export class EmailTransportService {
  private readonly logger = new Logger(EmailTransportService.name);
  private readonly resend?: Resend;
  private readonly from: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY') || '';
    this.from = this.configService.get<string>('RESEND_FROM') || '';

    if (this.apiKey && this.from) {
      this.resend = new Resend(this.apiKey);
    }
  }

  async send(payload: SendEmailDto): Promise<{ id: string }> {
    if (!this.resend || !this.apiKey || !this.from) {
      throw new Error('Email service is not configured. Set RESEND_API_KEY and RESEND_FROM.');
    }

    try {
      const response = await this.resend.emails.send({
        from: this.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        attachments: payload.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
      } as Parameters<Resend['emails']['send']>[0]);

      if (response.error) {
        throw new Error(`Resend error: ${response.error.message}`);
      }

      return { id: response.data?.id || '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email to ${payload.to}: ${message}`);
      throw error;
    }
  }
}

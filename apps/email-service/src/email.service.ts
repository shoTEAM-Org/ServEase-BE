import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import * as nodemailer from 'nodemailer';

const APP_NAME = 'ServEase';
const FROM_ADDRESS = process.env.EMAIL_FROM || `no-reply@servease.app`;

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly supabase: SupabaseClient) {}

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  private async send(to: string, subject: string, html: string) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      this.logger.warn(`SMTP not configured — skipping email to ${to}: ${subject}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: `${APP_NAME} <${FROM_ADDRESS}>`, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }

  private async resolveEmail(userId: string): Promise<{ email: string; name: string } | null> {
    try {
      const { data, error } = await this.supabase.auth.admin.getUserById(userId);
      if (error || !data?.user?.email) return null;
      const name = (data.user.user_metadata?.full_name as string) || data.user.email;
      return { email: data.user.email, name };
    } catch {
      return null;
    }
  }

  async sendWelcome(userId: string, email: string, fullName: string, role: string) {
    const name = fullName || email;
    if (role === 'provider') {
      await this.send(
        email,
        `Your ServEase provider application is under review`,
        `
        <p>Hi ${name},</p>
        <p>Thank you for applying to be a service provider on <strong>${APP_NAME}</strong>.</p>
        <p>Our team will review your application and supporting documents. We'll notify you by email once a decision has been made.</p>
        <p>In the meantime, you can check your application status in the app.</p>
        <br/>
        <p>The ${APP_NAME} Team</p>
        `,
      );
    } else {
      await this.send(
        email,
        `Welcome to ${APP_NAME}!`,
        `
        <p>Hi ${name},</p>
        <p>Welcome to <strong>${APP_NAME}</strong> — your go-to platform for trusted home services.</p>
        <p>You can now browse verified service providers, book appointments, and manage everything from the app.</p>
        <br/>
        <p>The ${APP_NAME} Team</p>
        `,
      );
    }
  }

  async sendProviderApproved(userId: string) {
    const user = await this.resolveEmail(userId);
    if (!user) {
      this.logger.warn(`Could not resolve email for userId ${userId} (approved)`);
      return;
    }
    await this.send(
      user.email,
      `Your ${APP_NAME} provider application has been approved!`,
      `
      <p>Hi ${user.name},</p>
      <p>Great news — your application to join <strong>${APP_NAME}</strong> as a service provider has been <strong>approved</strong>.</p>
      <p>You can now log in to the app, complete your profile, and start receiving booking requests.</p>
      <br/>
      <p>The ${APP_NAME} Team</p>
      `,
    );
  }

  async sendProviderRejected(userId: string, reason?: string) {
    const user = await this.resolveEmail(userId);
    if (!user) {
      this.logger.warn(`Could not resolve email for userId ${userId} (rejected)`);
      return;
    }
    await this.send(
      user.email,
      `Update on your ${APP_NAME} provider application`,
      `
      <p>Hi ${user.name},</p>
      <p>Thank you for your interest in joining <strong>${APP_NAME}</strong> as a service provider.</p>
      <p>After reviewing your application, we were unable to approve it at this time.</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      <p>If you believe this is a mistake or would like to reapply with updated documents, please contact our support team.</p>
      <br/>
      <p>The ${APP_NAME} Team</p>
      `,
    );
  }
}

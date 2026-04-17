import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  InternalServerErrorException,
  Param,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Response } from 'express';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';
import 'multer';

@Controller('api/v1/uploads')
export class UploadsController {
  constructor(private readonly supabase: SupabaseClient) {}

  @Post('avatar')
  @UseGuards(SupabaseAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    const userId = this.normalizeSegment(req['user']?.id);
    if (!userId) {
      throw new BadRequestException('Authenticated user is required');
    }

    const filePath = `${userId}.jpg`;
    const { error } = await this.supabase.storage
      .from('avatars')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype || 'image/jpeg',
        upsert: true,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Avatar upload failed: ${error.message}`,
      );
    }

    const { data } = this.supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);
    return { avatar_url: data.publicUrl };
  }

  @Get('avatar/:userId')
  @HttpCode(302)
  getAvatar(@Param('userId') userId: string, @Res() res: Response) {
    const normalizedUserId = this.normalizeSegment(userId);
    if (!normalizedUserId) {
      throw new BadRequestException('userId is required');
    }

    const filePath = `${normalizedUserId}.jpg`;
    const { data } = this.supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);
    return res.redirect(data.publicUrl);
  }

  @Post('booking/:bookingId/attachment')
  @UseGuards(SupabaseAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadBookingAttachment(
    @Param('bookingId') bookingId: string,
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Attachment file is required');
    }

    const normalizedBookingId = this.normalizeSegment(bookingId);
    if (!normalizedBookingId) {
      throw new BadRequestException('bookingId is required');
    }

    const userId = this.normalizeSegment(req['user']?.id);
    if (!userId) {
      throw new BadRequestException('Authenticated user is required');
    }

    const safeName = this.sanitizeFileName(
      label || file.originalname || 'attachment.jpg',
    );
    const storagePath = `${normalizedBookingId}/${userId}/${Date.now()}-${safeName}`;

    const { error } = await this.supabase.storage
      .from('booking-attachments')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Attachment upload failed: ${error.message}`,
      );
    }

    const { data: signedUrlData, error: signedUrlError } =
      await this.supabase.storage
        .from('booking-attachments')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new InternalServerErrorException(
        `Attachment signing failed: ${signedUrlError?.message || 'Unable to generate signed URL'}`,
      );
    }

    return {
      id: storagePath,
      public_url: signedUrlData.signedUrl,
      signed_url: signedUrlData.signedUrl,
      label: safeName,
      storage_path: storagePath,
    };
  }

  private normalizeSegment(value: unknown) {
    return String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private sanitizeFileName(value: string) {
    return (
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || `attachment-${Date.now()}.jpg`
    );
  }
}

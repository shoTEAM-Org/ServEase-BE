import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class BookingService {
  constructor(private readonly supabase: SupabaseClient) {}

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private extractStoragePathFromAttachmentUrl(fileUrl: unknown): string | null {
    const raw = this.toTrimmedString(fileUrl);
    if (!raw) return null;

    const markers = [
      '/storage/v1/object/public/booking-attachments/',
      '/storage/v1/object/sign/booking-attachments/',
      '/storage/v1/object/authenticated/booking-attachments/',
      '/object/public/booking-attachments/',
      '/object/sign/booking-attachments/',
      '/object/authenticated/booking-attachments/',
      '/booking-attachments/',
    ];

    for (const marker of markers) {
      const markerIndex = raw.indexOf(marker);
      if (markerIndex < 0) continue;
      const withQuery = raw.slice(markerIndex + marker.length);
      const withoutQuery = withQuery.split('?')[0].replace(/^\/+/, '').trim();
      if (withoutQuery) return withoutQuery;
    }

    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      const candidate = raw.split('?')[0].replace(/^\/+/, '').trim();
      if (candidate.includes('/')) return candidate;
    }

    return null;
  }

  private async toSignedAttachmentUrl(
    storagePath: string,
  ): Promise<string | null> {
    const normalizedStoragePath = this.toTrimmedString(storagePath);
    if (!normalizedStoragePath) return null;

    const { data, error } = await this.supabase.storage
      .from('booking-attachments')
      .createSignedUrl(normalizedStoragePath, 60 * 60 * 24 * 7);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  private isPermissionDeniedError(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    const message = this.toTrimmedString(error?.message).toLowerCase();
    return (
      code === '42501' ||
      message.includes('permission denied') ||
      message.includes('row-level security')
    );
  }

  private createAccessScopedSupabase(
    accessToken: string,
  ): SupabaseClient | null {
    const token = this.toTrimmedString(accessToken);
    const supabaseUrl = this.toTrimmedString(process.env.SUPABASE_URL);
    const supabaseKey = this.toTrimmedString(process.env.SUPABASE_SECRET_KEY);
    if (!token || !supabaseUrl || !supabaseKey) return null;

    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }

  private normalizeAttachmentPayload(bookingId: string, attachments: any[]) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return [] as Record<string, any>[];
    }

    return attachments
      .map((row: any, index: number) => ({
        booking_id: bookingId,
        file_url: this.toTrimmedString(row?.file_url || row?.uri),
        file_name:
          this.toTrimmedString(row?.file_name || row?.label) ||
          `Attachment ${index + 1}`,
        mime_type: this.toTrimmedString(row?.mime_type) || 'image/jpeg',
        storage_path: this.toTrimmedString(row?.storage_path) || null,
      }))
      .filter((row) => row.file_url);
  }

  private async getAttachmentsWithClient(
    client: SupabaseClient,
    bookingId: string,
  ) {
    const { data, error } = await client
      .schema('booking')
      .from('booking_attachments')
      .select(
        'id, booking_id, file_url, file_name, mime_type, storage_path, created_at',
      )
      .eq('booking_id', bookingId);
    if (error) throw error;

    const attachments = await Promise.all(
      (data || []).map(async (row: any) => {
        const storagePath =
          this.toTrimmedString(row?.storage_path) ||
          this.extractStoragePathFromAttachmentUrl(row?.file_url);
        if (!storagePath) return row;

        const signedUrl = await this.toSignedAttachmentUrl(storagePath);
        if (!signedUrl) return row;

        return {
          ...row,
          storage_path: storagePath,
          file_url: signedUrl,
        };
      }),
    );

    return { attachments };
  }

  private async saveAttachmentsWithClient(
    client: SupabaseClient,
    bookingId: string,
    attachments: any[],
  ) {
    const payload = this.normalizeAttachmentPayload(bookingId, attachments);
    if (!payload.length) return { attachments: [] };

    const { data, error } = await client
      .schema('booking')
      .from('booking_attachments')
      .insert(payload)
      .select(
        'id,booking_id,file_url,file_name,mime_type,storage_path,created_at',
      );
    if (error) throw error;

    return { attachments: data || [] };
  }

  private async collectAttachmentStorageRows(
    prefix: string,
    depth = 0,
  ): Promise<
    Array<{
      storagePath: string;
      fileName: string;
      mimeType: string | null;
      createdAt: string | null;
    }>
  > {
    if (depth > 4) return [];

    const normalizedPrefix = this.toTrimmedString(prefix);
    if (!normalizedPrefix) return [];

    const { data, error } = await this.supabase.storage
      .from('booking-attachments')
      .list(normalizedPrefix, {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' },
      });
    if (error) throw error;

    const rows: Array<{
      storagePath: string;
      fileName: string;
      mimeType: string | null;
      createdAt: string | null;
    }> = [];

    for (const entry of data || []) {
      const name = this.toTrimmedString((entry as any)?.name);
      if (!name) continue;

      const fullPath = `${normalizedPrefix}/${name}`;
      const entryMetadata = (entry as any)?.metadata;
      const isFile = Boolean((entry as any)?.id) || Boolean(entryMetadata);

      if (isFile) {
        rows.push({
          storagePath: fullPath,
          fileName: name,
          mimeType: this.toTrimmedString(entryMetadata?.mimetype) || null,
          createdAt: this.toTrimmedString((entry as any)?.created_at) || null,
        });
        continue;
      }

      const nestedRows = await this.collectAttachmentStorageRows(
        fullPath,
        depth + 1,
      );
      rows.push(...nestedRows);
    }

    return rows;
  }

  private async getAttachmentsFromStorage(bookingId: string) {
    try {
      const storageRows = await this.collectAttachmentStorageRows(bookingId);
      const attachments = await Promise.all(
        storageRows.map(async (row, index) => {
          const signedUrl = await this.toSignedAttachmentUrl(row.storagePath);
          if (!signedUrl) return null;
          return {
            id: `storage-${index}-${row.storagePath}`,
            booking_id: bookingId,
            file_url: signedUrl,
            file_name: row.fileName || 'Attachment',
            mime_type: row.mimeType,
            storage_path: row.storagePath,
            created_at: row.createdAt,
          };
        }),
      );

      return attachments.filter((row): row is NonNullable<typeof row> =>
        Boolean(row),
      );
    } catch {
      return [] as any[];
    }
  }

  async createBooking(dto: any, customerId: string) {
    const { data: userRecord, error: userError } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('role, status')
      .eq('id', dto.provider_id)
      .single();
    if (userError || !userRecord)
      throw new NotFoundException('Provider not found in the system.');
    if (userRecord.role !== 'provider')
      throw new BadRequestException(
        'Bookings can only be made with registered providers.',
      );

    const { data: profileRecord, error: profileError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('verification_status')
      .eq('user_id', dto.provider_id)
      .single();
    if (profileError || !profileRecord)
      throw new BadRequestException(
        'Provider profile is missing or incomplete.',
      );

    if (
      userRecord.status !== 'active' ||
      profileRecord.verification_status !== 'approved'
    ) {
      throw new BadRequestException({
        message: 'Booking rejected: This provider is not yet fully verified.',
        account_status: userRecord.status,
        profile_verification: profileRecord.verification_status,
      });
    }

    const totalAmount =
      dto.total_amount ?? (dto.hourly_rate || 0) * (dto.hours_required || 1);
    const bookingRef = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;

    const { data: newBooking, error: bookingError } = await this.supabase
      .schema('booking')
      .from('bookings')
      .insert([
        {
          booking_reference: bookingRef,
          customer_id: customerId,
          provider_id: dto.provider_id,
          service_id: dto.service_id,
          service_address: dto.service_address,
          scheduled_at: dto.scheduled_at,
          hourly_rate: dto.hourly_rate,
          hours_required: dto.hours_required,
          total_amount: totalAmount,
          status: 'pending',
        },
      ])
      .select()
      .single();
    if (bookingError) throw new BadRequestException(bookingError.message);
    return { message: 'Booking successfully created!', booking: newBooking };
  }

  async getCustomerBookings(customerId: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    // Fetch provider info separately (cross-schema join not supported)
    const bookings = await Promise.all(
      (data || []).map(async (booking: any) => {
        const { data: providerUser } = await this.supabase
          .schema('identity_and_user')
          .from('users')
          .select('full_name, contact_number')
          .eq('id', booking.provider_id)
          .single();
        const { data: providerProfile } = await this.supabase
          .schema('provider_catalog')
          .from('provider_profiles')
          .select('business_name, average_rating')
          .eq('user_id', booking.provider_id)
          .single();
        return {
          ...booking,
          provider: { ...(providerUser || {}), ...(providerProfile || {}) },
        };
      }),
    );

    return { bookings };
  }

  async getHistory() {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .in('status', ['completed', 'cancelled', 'disputed']);
    if (error) throw new BadRequestException(error.message);
    return { history: data };
  }

  async getRequests() {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('status', 'pending');
    if (error) throw new BadRequestException(error.message);
    return { requests: data };
  }

  async getBookingById(id: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116')
        throw new NotFoundException('Booking not found');
      throw new InternalServerErrorException(error.message);
    }

    // Fetch provider and customer info separately (cross-schema join not supported)
    const [providerUser, providerProfile, customerUser] = await Promise.all([
      this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('full_name, contact_number')
        .eq('id', data.provider_id)
        .single(),
      this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .select('business_name, average_rating')
        .eq('user_id', data.provider_id)
        .single(),
      this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('full_name, contact_number')
        .eq('id', data.customer_id)
        .single(),
    ]);

    return {
      booking: {
        ...data,
        provider: {
          ...(providerUser.data || {}),
          ...(providerProfile.data || {}),
        },
        customer: customerUser.data || {},
      },
    };
  }

  async updateStatus(id: string, status: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116')
        throw new NotFoundException(`Booking with id ${id} not found`);
      throw new BadRequestException(error.message);
    }
    return { message: 'Booking status updated successfully.', booking: data };
  }

  async cancelBooking(
    id: string,
    userId: string,
    reason: string,
    explanation: string,
  ) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    const { error: cancellationError } = await this.supabase
      .schema('booking')
      .from('bookings_cancellations')
      .insert([
        {
          booking_id: id,
          cancelled_by: userId,
          reason,
          detailed_explanation: explanation,
        },
      ]);
    if (cancellationError)
      throw new BadRequestException(cancellationError.message);

    return { booking: data };
  }

  async getAttachments(bookingId: string, accessToken?: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { attachments: [] };

    let tableResult: { attachments: any[] } | null = null;
    let lastError: any = null;

    try {
      tableResult = await this.getAttachmentsWithClient(
        this.supabase,
        normalizedBookingId,
      );
    } catch (error: any) {
      const scopedClient = this.createAccessScopedSupabase(accessToken || '');
      if (scopedClient && this.isPermissionDeniedError(error)) {
        try {
          tableResult = await this.getAttachmentsWithClient(
            scopedClient,
            normalizedBookingId,
          );
        } catch (fallbackError: any) {
          lastError = fallbackError;
        }
      } else {
        lastError = error;
      }
    }

    if (
      tableResult &&
      Array.isArray(tableResult.attachments) &&
      tableResult.attachments.length > 0
    ) {
      return tableResult;
    }

    const storageAttachments =
      await this.getAttachmentsFromStorage(normalizedBookingId);
    if (storageAttachments.length > 0) {
      return { attachments: storageAttachments };
    }

    if (tableResult) return tableResult;
    if (lastError) {
      throw new InternalServerErrorException(
        this.toTrimmedString(lastError?.message) ||
          'Failed to fetch booking attachments',
      );
    }

    return { attachments: [] };
  }

  async saveAttachments(
    bookingId: string,
    attachments: any[],
    accessToken?: string,
  ) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { attachments: [] };

    try {
      return await this.saveAttachmentsWithClient(
        this.supabase,
        normalizedBookingId,
        attachments,
      );
    } catch (error: any) {
      const scopedClient = this.createAccessScopedSupabase(accessToken || '');
      if (scopedClient && this.isPermissionDeniedError(error)) {
        try {
          return await this.saveAttachmentsWithClient(
            scopedClient,
            normalizedBookingId,
            attachments,
          );
        } catch (fallbackError: any) {
          if (this.isPermissionDeniedError(fallbackError)) {
            return { attachments: [] };
          }
          throw new InternalServerErrorException(
            this.toTrimmedString(fallbackError?.message) ||
              'Failed to save booking attachments',
          );
        }
      }

      if (this.isPermissionDeniedError(error)) {
        return { attachments: [] };
      }

      throw new InternalServerErrorException(
        this.toTrimmedString(error?.message) ||
          'Failed to save booking attachments',
      );
    }
  }

  async createDispute(bookingId: string, userId: string, reason: string) {
    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .insert([
        { booking_id: bookingId, raised_by: userId, reason, status: 'open' },
      ])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return { dispute: data };
  }
}

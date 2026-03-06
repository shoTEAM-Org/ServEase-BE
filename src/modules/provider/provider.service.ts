import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { RegisterProviderDto } from './dto/register-provider.dto';
import { Express } from 'express';
import 'multer';

@Injectable()
export class ProviderService {
  constructor(private readonly supabase: SupabaseClient) {}

  async registerProvider(dto: RegisterProviderDto, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('document_file image is required');

    const { full_name, email, contact_number, password, role, business_name, document_type } = dto;

    const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
      email,
      password, 
      email_confirm: true 
    });

    if (authError) throw new BadRequestException(`Auth Registration Error: ${authError.message}`);

    const newUserId = authData.user.id;

    const { error: userError } = await this.supabase
      .from('users')
      .insert([{
        id: newUserId, 
        full_name,
        email,
        contact_number,
        role,
        status: 'pending',
        is_verified: false
      }]);

    if (userError) {
      await this.supabase.auth.admin.deleteUser(newUserId);
      throw new BadRequestException(`User Profile Error: ${userError.message}`);
    }

    const { data: profile, error: profileError } = await this.supabase
      .from('provider_profiles')
      .insert([{
        user_id: newUserId,
        business_name,
        verification_status: 'pending'
      }])
      .select()
      .single();

    if (profileError) throw new BadRequestException(`Provider Profile Error: ${profileError.message}`);

    const filePath = `kyc/${newUserId}/${Date.now()}_${file.originalname}`;
    const { error: uploadError } = await this.supabase.storage
      .from('verification-docs')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) throw new BadRequestException(`Storage Upload Error: ${uploadError.message}`);

    const { error: docError } = await this.supabase
      .from('provider_documents')
      .insert([{
        provider_id: newUserId,
        document_type,
        document_file_path: filePath,
        status: 'pending'
      }]);

    if (docError) throw new BadRequestException(`Document Link Error: ${docError.message}`);

    return {
      status: "success",
      message: "Provider application submitted. Pending approval.",
      data: {
        provider_id: newUserId,
        business_name: profile.business_name,
        verification_status: profile.verification_status
      }
    };
  }

  async getProviderProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('provider_profiles')
      .select(`
        user_id, 
        business_name, 
        verification_status,
        provider_documents (
          document_id,
          document_type,
          document_file_path,
          status
        )
      `)
      .eq('user_id', userId)
      .single();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Provider profile not found');

    const documentsWithUrls = await Promise.all(
      data.provider_documents.map(async (doc) => {
        const { data: urlData, error: urlError } = await this.supabase.storage
          .from('verification-docs')
          .createSignedUrl(doc.document_file_path, 60);

        if (urlError) console.error('URL Generation Error:', urlError.message);

        return {
          ...doc,
          view_url: urlData?.signedUrl || null 
        };
      }),
    );

    return {
      status: 'success',
      data: {
        provider_id: data.user_id,
        business_name: data.business_name,
        verification_status: data.verification_status,
        provider_documents: documentsWithUrls
      }
    };
  }
}
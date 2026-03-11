import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { RegisterProviderDto } from './dto/register-provider.dto';
import { Express } from 'express';
import 'multer';

@Injectable()
export class ProviderService {
  constructor(private readonly supabase: SupabaseClient) {}

  async registerProvider(dto: RegisterProviderDto, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('document_file image is required');

    
    const { 
      full_name, email, contact_number, password, role, 
      business_name, document_type, date_of_birth,
    } = dto;

    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;
    if (!passwordRegex.test(password)) {
      throw new BadRequestException(
        'Password must be 8-128 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.'
      );
    }

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
        is_verified: false,
        date_of_birth 
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
  async getProviderDashboard(providerId: string) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Count pending job requests
    const { count: newRequests, error: bookingErr } = await this.supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('status', 'pending');

    if (bookingErr) throw new InternalServerErrorException('Error fetching bookings');

    // Sum net_amount from payouts for the current month
    const { data: payouts, error: payoutErr } = await this.supabase
      .from('provider_payouts')
      .select('net_amount')
      .eq('provider_id', providerId)
      .gte('created_at', firstDayOfMonth);

    if (payoutErr) throw new InternalServerErrorException('Error fetching payouts');

    const totalEarnings = payouts?.reduce((acc, curr) => acc + Number(curr.net_amount), 0) || 0;

    return {
      new_job_requests: newRequests || 0,
      total_earnings: totalEarnings,
    };
  }
  async reuploadKycDocument(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('A new document file is required for reupload');

    // Verify Reject
    const { data: profile, error: profileErr } = await this.supabase
      .from('provider_profiles')
      .select('verification_status')
      .eq('user_id', userId)
      .single();

    if (profileErr || !profile) {
      throw new NotFoundException('Provider profile not found');
    }

    if (profile.verification_status !== 'rejected') {
      throw new BadRequestException('Only providers with a "rejected" status can reupload KYC documents');
    }

    
    const filePath = `kyc/${userId}/${Date.now()}_${file.originalname}`;
    const { error: uploadError } = await this.supabase.storage
      .from('verification-docs')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false // New File
      });

    if (uploadError) throw new BadRequestException(`Storage Upload Error: ${uploadError.message}`);

    
    const { error: docError } = await this.supabase
      .from('provider_documents')
      .update({
        document_file_path: filePath,
        status: 'pending',
        reject_reason: null, 
        uploaded_at: new Date().toISOString() 
      })
      .eq('provider_id', userId);

    if (docError) throw new BadRequestException(`Document Update Error: ${docError.message}`);

    // Pending Status in Provider_profiles
    const { error: updateProfileErr } = await this.supabase
      .from('provider_profiles')
      .update({ verification_status: 'pending' })
      .eq('user_id', userId);

    if (updateProfileErr) throw new BadRequestException(`Profile Update Error: ${updateProfileErr.message}`);

    // Pending Status in Users
    const { error: updateUserErr } = await this.supabase
      .from('users')
      .update({ status: 'pending' })
      .eq('id', userId);

    if (updateUserErr) throw new BadRequestException(`User Update Error: ${updateUserErr.message}`);

    return {
      status: 'success',
      message: 'KYC document successfully reuploaded. Application is back under pending review.'
    };
  }
}
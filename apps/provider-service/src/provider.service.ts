import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { providersByService } from '@app/common/mock-data/providers-by-service.js';
import 'multer';

@Injectable()
export class ProviderService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getProviderReviews(providerId: string) {
    const { data: profile, error: profileErr } = await this.supabase
      .from('provider_profiles')
      .select('average_rating, total_reviews')
      .eq('user_id', providerId)
      .single();

    if (profileErr) throw new InternalServerErrorException(`Failed to fetch provider profile stats: ${profileErr.message}`);
    if (!profile) throw new NotFoundException('Provider profile not found');

    const { data: reviews, error: reviewsErr } = await this.supabase
      .from('reviews')
      .select('id, reviewer_id, rating, review_text, created_at')
      .eq('reviewee_id', providerId)
      .order('created_at', { ascending: false });

    if (reviewsErr) throw new InternalServerErrorException(`Failed to fetch individual reviews: ${reviewsErr.message}`);

    return {
      status: 'success',
      data: {
        provider_id: providerId,
        average_rating: Number(profile.average_rating) || 0,
        total_reviews: Number(profile.total_reviews) || 0,
        reviews,
      },
    };
  }

  async getTrustScore(providerId: string) {
    if (!providerId) throw new BadRequestException('provider_id query parameter is required');

    const { data, error } = await this.supabase
      .from('provider_profiles')
      .select('trust_score')
      .eq('user_id', providerId)
      .single();

    if (error) throw new InternalServerErrorException(`Failed to fetch trust score: ${error.message}`);
    if (!data) throw new NotFoundException('Provider profile not found');

    return {
      status: 'success',
      data: { provider_id: providerId, trust_score: Number(data.trust_score) || 0 },
    };
  }

  getMockProvidersByService(serviceId: number) {
    const providers = providersByService[serviceId];
    return { success: true, data: providers || [] };
  }

  searchMockProviders(searchTerm: string) {
    const allProviders = Object.values(providersByService).flat();
    const lowerCaseSearch = searchTerm.toLowerCase();
    const filteredProviders = allProviders.filter((provider) => {
      const matchName = provider.name.toLowerCase().includes(lowerCaseSearch);
      const matchBusiness = (provider.businessName || '').toLowerCase().includes(lowerCaseSearch);
      const matchDesc = provider.description.toLowerCase().includes(lowerCaseSearch);
      return matchName || matchBusiness || matchDesc;
    });
    return { success: true, data: filteredProviders };
  }

  async getProviderProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('provider_profiles')
      .select(`user_id, business_name, verification_status, provider_documents (document_id, document_type, document_file_path, status)`)
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
        return { ...doc, view_url: urlData?.signedUrl || null };
      }),
    );

    return {
      status: 'success',
      data: {
        provider_id: data.user_id,
        business_name: data.business_name,
        verification_status: data.verification_status,
        provider_documents: documentsWithUrls,
      },
    };
  }

  async getProviderDashboard(providerId: string) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { count: newRequests, error: bookingErr } = await this.supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('status', 'pending');

    if (bookingErr) throw new InternalServerErrorException('Error fetching bookings');

    const { data: payouts, error: payoutErr } = await this.supabase
      .from('provider_payouts')
      .select('net_amount')
      .eq('provider_id', providerId)
      .gte('created_at', firstDayOfMonth);

    if (payoutErr) throw new InternalServerErrorException('Error fetching payouts');

    const totalEarnings = payouts?.reduce((acc, curr) => acc + Number(curr.net_amount), 0) || 0;

    return { new_job_requests: newRequests || 0, total_earnings: totalEarnings };
  }

  async reuploadKycDocument(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('A new document file is required for reupload');

    const { data: profile, error: profileErr } = await this.supabase
      .from('provider_profiles')
      .select('verification_status')
      .eq('user_id', userId)
      .single();

    if (profileErr || !profile) throw new NotFoundException('Provider profile not found');
    if (profile.verification_status !== 'rejected') {
      throw new BadRequestException('Only providers with a "rejected" status can reupload KYC documents');
    }

    const filePath = `kyc/${userId}/${Date.now()}_${file.originalname}`;
    const { error: uploadError } = await this.supabase.storage
      .from('verification-docs')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) throw new BadRequestException(`Storage Upload Error: ${uploadError.message}`);

    const { error: docError } = await this.supabase
      .from('provider_documents')
      .update({ document_file_path: filePath, status: 'pending', reject_reason: null, uploaded_at: new Date().toISOString() })
      .eq('provider_id', userId);

    if (docError) throw new BadRequestException(`Document Update Error: ${docError.message}`);

    const { error: updateProfileErr } = await this.supabase
      .from('provider_profiles')
      .update({ verification_status: 'pending' })
      .eq('user_id', userId);

    if (updateProfileErr) throw new BadRequestException(`Profile Update Error: ${updateProfileErr.message}`);

    const { error: updateUserErr } = await this.supabase
      .from('users')
      .update({ status: 'pending' })
      .eq('id', userId);

    if (updateUserErr) throw new BadRequestException(`User Update Error: ${updateUserErr.message}`);

    return { status: 'success', message: 'KYC document successfully reuploaded. Application is back under pending review.' };
  }
}

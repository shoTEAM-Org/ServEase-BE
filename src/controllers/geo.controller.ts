import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TribeClient } from '@implementsprint/sdk';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@UseGuards(SupabaseAuthGuard)
@Controller('api/geo/v1')
export class GeoController {
  constructor(private readonly tribe: TribeClient) {}

  @Post('geocode')
  async geocode(@Body() body: { address: string; language?: string }) {
    return this.tribe.geoGeocodeAddress({
      address: body.address,
      language: body.language,
    });
  }

  @Post('reverse-geocode')
  async reverseGeocode(@Body() body: { latitude: number; longitude: number; language?: string }) {
    return this.tribe.geoReverseGeocode({
      latitude: body.latitude,
      longitude: body.longitude,
      language: body.language,
    });
  }
}

import { Controller, Get } from '@nestjs/common';
import { philippineLocations } from '../../mock-data/ph-locations';

@Controller('api/locations')
export class LocationsController {
    @Get('v1')
    getLocations (){
        return {
            success: true,
            data: philippineLocations
        };
    }
}
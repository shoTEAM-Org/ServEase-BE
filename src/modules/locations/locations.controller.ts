import { Controller, Get } from '@nestjs/common';
import { philippineLocations } from '../../mock-data/ph-locations';

@Controller('api/locations')
export class LocationsController {
    @Get()
    getLocations (){
        return {
            success: true,
            data: philippineLocations
        };
    }
}
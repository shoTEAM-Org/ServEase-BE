import { Controller, Get } from '@nestjs/common';
import { ReferenceService} from './reference.service';

@Controller('api/reference')
export class ReferenceController {
    constructor(private readonly referenceService: ReferenceService) {}

    @Get('v1/categories')
    async getCategories() {
        return this.referenceService.getCategories();
    }
}

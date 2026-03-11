import { Controller, Get } from '@nestjs/common';
import { ReferenceService} from './reference.service';

@Controller('api/v1/reference')
export class ReferenceController {
    constructor(private readonly referenceService: ReferenceService) {}

    @Get('categories')
    async getCategories() {
        return this.referenceService.getCategories();
    }
}

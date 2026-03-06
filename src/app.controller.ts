import { Controller, Get } from '@nestjs/common';
<<<<<<< HEAD
import { AppService } from './app.service';
=======
import { AppService } from './app.service'; 
>>>>>>> origin/customer-registration

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
<<<<<<< HEAD
}
=======
} 
>>>>>>> origin/customer-registration

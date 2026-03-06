import {Controller, Post, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import {LoginUserDto} from './dto/login-user.dto';

@Controller('api/v1/auth')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Post('login')
    async login(@Body() loginDto: LoginUserDto) {
        return this.usersService.login(loginDto);
    }
}
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'S16Z Portfolio Management System API is running!';
  }
}
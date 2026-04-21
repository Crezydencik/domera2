import { Module } from '@nestjs/common';
import { ResidentController } from './resident.controller';
import { ResidentService } from './resident.service';

@Module({
  controllers: [ResidentController],
  providers: [ResidentService],
})
export class ResidentModule {}
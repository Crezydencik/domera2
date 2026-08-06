import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { ResidentController } from './resident/resident.controller';
import { ResidentService } from './resident/resident.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [CommonModule, BuildingsModule],
  controllers: [UsersController, ResidentController],
  providers: [UsersService, ResidentService],
  exports: [UsersService],
})
export class UsersModule {}

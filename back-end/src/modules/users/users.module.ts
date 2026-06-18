import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [CommonModule, BuildingsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

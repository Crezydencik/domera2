import { Module } from '@nestjs/common';
import { EmailModule } from '../emails/email.module';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';

@Module({
  imports: [EmailModule],
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}

import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './services/audit-log.service';
import { RateLimitService } from './services/rate-limit.service';

@Global()
@Module({
  providers: [RateLimitService, AuditLogService],
  exports: [RateLimitService, AuditLogService],
})
export class CommonModule {}

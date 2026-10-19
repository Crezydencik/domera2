import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FirebaseAdminService } from '../infrastructure/firebase/firebase-admin.service';
export declare class BuildingStatsInvalidationInterceptor implements NestInterceptor {
    private readonly firebaseAdminService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
    private buildingIdsOfApartment;
}

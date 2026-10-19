import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import { FirebaseAdminService } from '../infrastructure/firebase/firebase-admin.service';
import { refreshApartmentMemberKeys } from '../utils/apartment-members';
import { markBuildingStatsStale } from '../utils/building-stats-cache';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type RequestLike = {
  method?: string;
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
};

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

/**
 * After a successful mutating request on an apartment route, marks the cached stats of the
 * affected building(s) as stale and refreshes the apartment's `memberKeys`. The building is resolved *before* the handler (so deletes and
 * building moves are covered) and again from the response (creates / imports).
 */
@Injectable()
export class BuildingStatsInvalidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(BuildingStatsInvalidationInterceptor.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    if (!MUTATING_METHODS.has((request.method ?? '').toUpperCase())) return next.handle();

    const apartmentId = firstString(request.params?.apartmentId, request.params?.id);

    return from(this.buildingIdsOfApartment(apartmentId)).pipe(
      mergeMap((before) =>
        next.handle().pipe(
          mergeMap(async (response) => {
            const affectedApartmentId = firstString(
              apartmentId,
              (response as Record<string, unknown> | undefined)?.id,
              (response as Record<string, unknown> | undefined)?.apartmentId,
            );
            const after = await this.buildingIdsOfApartment(affectedApartmentId);
            // Keep the membership candidate index in sync with owner / tenant changes.
            await refreshApartmentMemberKeys(this.firebaseAdminService.firestore, affectedApartmentId).catch(
              (error: unknown) =>
                this.logger.warn(`apartment.member_keys.refresh_failed reason=${error instanceof Error ? error.message : String(error)}`),
            );
            const responseBuildingId = firstString((response as Record<string, unknown> | undefined)?.buildingId);
            // Read the body only now: multipart bodies are parsed by method-level interceptors.
            const bodyBuildingIds = [firstString(request.body?.buildingId, request.body?.houseId)];
            await markBuildingStatsStale(this.firebaseAdminService.firestore, [
              ...before,
              ...after,
              ...bodyBuildingIds,
              responseBuildingId,
            ]).catch((error: unknown) =>
              this.logger.warn(`building_stats.invalidate_failed reason=${error instanceof Error ? error.message : String(error)}`),
            );
            return response;
          }),
        ),
      ),
    );
  }

  private async buildingIdsOfApartment(apartmentId: string | undefined): Promise<string[]> {
    if (!apartmentId) return [];
    try {
      const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
      if (!snap.exists) return [];
      const data = snap.data() as Record<string, unknown>;
      return [firstString(data.buildingId), firstString(data.houseId)].filter((id): id is string => Boolean(id));
    } catch {
      return [];
    }
  }
}

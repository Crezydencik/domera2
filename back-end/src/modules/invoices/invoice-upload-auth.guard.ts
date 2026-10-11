import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';

type HeaderMap = Record<string, string | string[] | undefined>;

type ApiKeyCredential = {
  id: string;
  companyId: string;
  label?: string;
  buildingId?: string;
  allowedBuildingIds?: string[];
  source: 'firestore' | 'env';
};

type RequestWithUser = {
  headers: HeaderMap;
  user?: RequestUser;
  apiCredential?: ApiKeyCredential;
};

const INVOICE_UPLOAD_SCOPES = new Set(['*', 'invoice:upload', 'invoices:upload', 'invoices:write']);

@Injectable()
export class InvoiceUploadAuthGuard implements CanActivate {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly firebaseAuthGuard: FirebaseAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const apiKey = this.extractApiKey(request.headers);

    if (apiKey) {
      const credential = await this.resolveApiKey(apiKey.value);
      if (credential) {
        request.user = {
          uid: `api-key:${credential.id}`,
          role: 'Accountant',
          accountType: 'ManagementCompany',
          companyId: credential.companyId,
        };
        request.apiCredential = credential;
        return true;
      }

      if (apiKey.required) {
        throw new UnauthorizedException('Invalid API key');
      }
    }

    return this.firebaseAuthGuard.canActivate(context);
  }

  private firstHeader(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
  }

  private extractApiKey(headers: HeaderMap): { value: string; required: boolean } | null {
    const directKey = this.firstHeader(headers['x-api-key']).trim();
    if (directKey) {
      return { value: directKey, required: true };
    }

    const authorization = this.firstHeader(headers.authorization).trim();
    if (!authorization) {
      return null;
    }

    const [scheme, ...rest] = authorization.split(/\s+/);
    const value = rest.join(' ').trim();
    if (!scheme || !value) {
      return null;
    }

    const normalizedScheme = scheme.toLowerCase();
    if (normalizedScheme === 'apikey' || normalizedScheme === 'api-key') {
      return { value, required: true };
    }

    if (normalizedScheme === 'bearer') {
      return { value, required: false };
    }

    return null;
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  private safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private resolveEnvApiKey(apiKey: string, keyHash: string): ApiKeyCredential | null {
    const raw = process.env.DOMERA_INVOICE_API_KEYS ?? process.env.INVOICE_UPLOAD_API_KEYS ?? '';
    const entries = raw
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const separator = entry.includes('=') ? '=' : ':';
      const [companyIdRaw, keyRaw, labelRaw] = entry.split(separator);
      const companyId = companyIdRaw?.trim();
      const configuredKey = keyRaw?.trim();
      if (!companyId || !configuredKey) {
        continue;
      }

      const isHash = configuredKey.startsWith('sha256:');
      const matches = isHash
        ? this.safeEquals(configuredKey.slice('sha256:'.length), keyHash)
        : this.safeEquals(configuredKey, apiKey);

      if (matches) {
        return {
          id: `env:${companyId}`,
          companyId,
          label: labelRaw?.trim() || 'Environment invoice upload key',
          source: 'env',
        };
      }
    }

    return null;
  }

  private timestampToMillis(value: unknown): number | null {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
      const date = value.toDate() as Date;
      return date.getTime();
    }

    return null;
  }

  private validateApiKeyData(
    id: string,
    data: Record<string, unknown>,
    source: ApiKeyCredential['source'],
  ): ApiKeyCredential {
    const companyId = typeof data.companyId === 'string' ? data.companyId.trim() : '';
    if (!companyId) {
      throw new UnauthorizedException('API key is not bound to a company');
    }

    const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : 'active';
    if (['disabled', 'inactive', 'revoked'].includes(status)) {
      throw new UnauthorizedException('API key is disabled');
    }

    const expiresAt = this.timestampToMillis(data.expiresAt);
    if (expiresAt !== null && expiresAt < Date.now()) {
      throw new UnauthorizedException('API key has expired');
    }

    const scopes = Array.isArray(data.scopes)
      ? data.scopes.filter((scope): scope is string => typeof scope === 'string')
      : [];

    if (!scopes.some((scope) => INVOICE_UPLOAD_SCOPES.has(scope))) {
      throw new ForbiddenException('API key is not allowed to upload invoices');
    }

    const allowedBuildingIds = Array.isArray(data.allowedBuildingIds)
      ? data.allowedBuildingIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : typeof data.buildingId === 'string' && data.buildingId.trim()
        ? [data.buildingId.trim()]
        : [];
    if (allowedBuildingIds.length === 0) {
      throw new UnauthorizedException('API key is not bound to a building');
    }

    return {
      id,
      companyId,
      label: typeof data.label === 'string' ? data.label : undefined,
      buildingId: typeof data.buildingId === 'string' ? data.buildingId : undefined,
      allowedBuildingIds,
      source,
    };
  }

  private async resolveFirestoreApiKey(keyHash: string): Promise<ApiKeyCredential | null> {
    const db = this.firebaseAdminService.firestore;
    // A collection-group lookup is indexed by the key hash.  Never enumerate every
    // building (or every key) for an unauthenticated, invalid credential.
    const snap = await db.collectionGroup('api_keys').where('keyHash', '==', keyHash).limit(1).get();
    if (snap.empty) return null;

    const match = snap.docs[0];
    const data = match.data() as Record<string, unknown>;
    return this.validateApiKeyData(
      match.id,
      {
        ...data,
        buildingId: typeof data.buildingId === 'string' ? data.buildingId : match.ref.parent.parent?.id,
      },
      'firestore',
    );
  }

  private async resolveApiKey(apiKey: string): Promise<ApiKeyCredential | null> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      return null;
    }

    const keyHash = this.hashApiKey(trimmed);
    const envCredential = this.resolveEnvApiKey(trimmed, keyHash);
    if (envCredential) {
      return envCredential;
    }

    return this.resolveFirestoreApiKey(keyHash);
  }
}

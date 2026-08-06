import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FirebaseIdentityToolkitService {
  constructor(private readonly configService: ConfigService) {}

  async call<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
    const apiKey = this.getFirebaseWebApiKey();

    if (!apiKey) {
      throw this.createServiceError(
        'Firebase Web API key is missing in the backend environment. Set FIREBASE_WEB_API_KEY.',
        500,
      );
    }

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    } & T;

    if (!response.ok) {
      const providerMessage = String(json.error?.message ?? '').toUpperCase();

      if (
        providerMessage.includes('INVALID_LOGIN_CREDENTIALS') ||
        providerMessage.includes('INVALID_PASSWORD')
      ) {
        throw this.createServiceError('Incorrect email or password', 401);
      }

      if (providerMessage.includes('EMAIL_NOT_FOUND') || providerMessage.includes('USER_NOT_FOUND')) {
        throw this.createServiceError('User account was not found', 404);
      }

      if (providerMessage.includes('EMAIL_EXISTS')) {
        throw this.createServiceError('This email is already registered', 409);
      }

      if (
        providerMessage.includes('WEAK_PASSWORD') ||
        providerMessage.includes('INVALID_EMAIL') ||
        providerMessage.includes('MISSING_EMAIL') ||
        providerMessage.includes('MISSING_PASSWORD') ||
        providerMessage.includes('INVALID_OOB_CODE')
      ) {
        throw this.createServiceError('Invalid authentication request', 400);
      }

      throw this.createServiceError('Firebase authentication request failed', 400);
    }

    return json;
  }

  private getFirebaseWebApiKey(): string {
    return (
      this.configService.get<string>('FIREBASE_WEB_API_KEY')?.trim() ||
      this.configService.get<string>('NEXT_PUBLIC_FIREBASE_API_KEY')?.trim() ||
      ''
    );
  }

  private createServiceError(message: string, statusCode: number): Error & { statusCode?: number } {
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = statusCode;
    return error;
  }
}

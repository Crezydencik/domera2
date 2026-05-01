import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const normalizePrivateKey = (value: string): string => {
  const trimmed = value.trim();
  const unwrapped =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;

  return unwrapped.replace(/\\n/g, '\n').trim();
};

@Injectable()
export class FirebaseAdminService {
  private app?: App;

  constructor(private readonly configService: ConfigService) {}

  get auth() {
    return getAuth(this.getApp());
  }

  get firestore() {
    return getFirestore(this.getApp());
  }

  private getApp(): App {
    if (!this.app) {
      this.app = this.initApp();
    }

    return this.app;
  }

  private initApp(): App {
    if (getApps().length > 0) {
      return getApps()[0]!;
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKeyRaw = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKeyRaw) {
      throw new Error(
        'Firebase Admin credentials are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
      );
    }

    const privateKey = normalizePrivateKey(privateKeyRaw);

    if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
      throw new Error(
        'FIREBASE_PRIVATE_KEY is malformed. Use the service account private key in PEM format.',
      );
    }

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
}

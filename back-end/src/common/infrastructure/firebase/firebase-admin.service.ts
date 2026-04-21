import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

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

  get storage() {
    return getStorage(this.getApp());
  }

  private getBucketName(): string {
    const bucket = this.configService.get<string>('FIREBASE_STORAGE_BUCKET');
    if (bucket && bucket.trim()) {
      return bucket.trim();
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    if (projectId && projectId.trim()) {
      return `${projectId.trim()}.appspot.com`;
    }

    throw new Error('Firebase Storage bucket name is not configured. Set FIREBASE_STORAGE_BUCKET');
  }

  get storageBucket() {
    return this.storage.bucket(this.getBucketName());
  }

  async createStorageFolder(folderPath: string): Promise<void> {
    const normalized = String(folderPath ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      throw new Error('Storage folder path is required');
    }

    const markerPath = `${normalized}/.keep`;
    try {
      await this.storageBucket.file(markerPath).save('', {
        metadata: { contentType: 'application/x-directory' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create storage folder ${folderPath}: ${message}`);
    }
  }

  async createStorageFolders(folderPaths: string[]): Promise<void> {
    if (!Array.isArray(folderPaths) || folderPaths.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      folderPaths.map((path) => this.createStorageFolder(path)),
    );

    const errors = results
      .map((result, index) => {
        if (result.status === 'rejected') {
          return `${folderPaths[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
        }
        return null;
      })
      .filter((error): error is string => error !== null);

    if (errors.length > 0) {
      console.error('Storage folder creation errors:', errors);
      throw new Error(`Failed to create ${errors.length} storage folders: ${errors.join('; ')}`);
    }
  }

  async getStorageFolderSummary(folderPath: string): Promise<{
    path: string;
    fileCount: number;
    hasUserFiles: boolean;
  }> {
    const normalized = String(folderPath ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      throw new Error('Storage folder path is required');
    }

    const prefix = `${normalized}/`;
    const [files] = await this.storageBucket.getFiles({ prefix });
    const userFiles = files.filter((file) => !file.name.endsWith('/.keep'));

    return {
      path: normalized,
      fileCount: userFiles.length,
      hasUserFiles: userFiles.length > 0,
    };
  }

  async deleteStorageFolder(folderPath: string): Promise<{ path: string; deleted: boolean }> {
    const normalized = String(folderPath ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      throw new Error('Storage folder path is required');
    }

    await this.storageBucket.deleteFiles({
      prefix: `${normalized}/`,
      force: true,
    });

    return { path: normalized, deleted: true };
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

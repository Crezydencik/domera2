export type UploadedDocumentFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

export type DocumentScope =
  | 'buildingResidents'
  | 'apartmentResidents'
  | 'apartmentPrivate'
  | 'privateApartment'
  | 'platformPrivate'
  | 'managementArchive';

export type UnknownRecord = Record<string, unknown>;
export type MemberApartment = { id: string; data: UnknownRecord };

export type DocumentRecord = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  scope: DocumentScope;
  companyId?: string;
  buildingId?: string;
  buildingName?: string;
  apartmentId?: string;
  apartmentLabel?: string;
  ownerUserId: string;
  uploaderRole?: string;
  storagePath: string;
  storageBucket: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentFilePayload = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

export const DOCUMENT_SCOPES = new Set<DocumentScope>([
  'buildingResidents',
  'apartmentResidents',
  'apartmentPrivate',
  'privateApartment',
  'platformPrivate',
  'managementArchive',
]);

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

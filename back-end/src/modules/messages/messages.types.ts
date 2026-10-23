export const MESSAGE_CATEGORIES = ['urgent', 'invoice', 'readings', 'documents', 'other'] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export type MessageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  storageBucket: string;
};

export type MessageReply = {
  id: string;
  body: string;
  authorUserId: string;
  authorName?: string;
  attachments: MessageAttachment[];
  emailStatus: 'sent' | 'failed' | 'skipped';
  createdAt: Date;
};

/** Обращение жильца в управляющую компанию: inbox_messages/{id}. */
export type MessageRecord = {
  companyId: string;
  buildingId: string;
  buildingName?: string;
  apartmentId: string;
  apartmentNumber?: string;
  senderUserId: string;
  senderName?: string;
  senderEmail?: string;
  senderRole: 'owner' | 'tenant';
  category: MessageCategory;
  subject: string;
  body: string;
  attachments: MessageAttachment[];
  read: boolean;
  archived: boolean;
  replies: MessageReply[];
  createdAt: Date;
  updatedAt: Date;
  lastReplyAt?: Date | null;
};

export type UploadedMessageFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

export const MESSAGE_LIMITS = {
  subject: 200,
  body: 5000,
  files: 3,
  fileBytes: 10 * 1024 * 1024,
  list: 1000,
} as const;

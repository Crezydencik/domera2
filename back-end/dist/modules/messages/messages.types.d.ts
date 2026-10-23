export declare const MESSAGE_CATEGORIES: readonly ["urgent", "invoice", "readings", "documents", "other"];
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
export declare const MESSAGE_LIMITS: {
    readonly subject: 200;
    readonly body: 5000;
    readonly files: 3;
    readonly fileBytes: number;
    readonly list: 1000;
};

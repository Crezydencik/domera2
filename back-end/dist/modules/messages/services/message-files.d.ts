import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { MessageAttachment, UploadedMessageFile } from '../messages.types';
export declare function detectMessageMime(buffer: Buffer): string;
export declare function sanitizeFileName(value: unknown): string;
export declare function storeMessageFiles(firebase: FirebaseAdminService, files: UploadedMessageFile[], pathBase: string[]): Promise<MessageAttachment[]>;
export declare function deleteMessageFiles(firebase: FirebaseAdminService, attachments: MessageAttachment[]): Promise<void>;
export declare const publicAttachment: (a: MessageAttachment) => {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
};

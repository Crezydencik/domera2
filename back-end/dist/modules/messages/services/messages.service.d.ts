import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { EmailService } from '../../emails/services/email.service';
import { UploadedMessageFile } from '../messages.types';
type Data = Record<string, unknown>;
export declare class MessagesService {
    private readonly firebase;
    private readonly rateLimit;
    private readonly emailService;
    private readonly logger;
    constructor(firebase: FirebaseAdminService, rateLimit: RateLimitService, emailService: EmailService);
    private get collection();
    private staffCompanyId;
    private memberRole;
    private serialize;
    private readBody;
    create(request: Request, user: RequestUser, body: Data, files: UploadedMessageFile[]): Promise<{
        item: {
            id: string;
            buildingId: string;
            buildingName: string | undefined;
            apartmentId: string;
            apartmentNumber: string | undefined;
            senderName: string | undefined;
            senderEmail: string | undefined;
            senderRole: string;
            category: unknown;
            subject: string;
            body: string;
            attachments: {
                id: string;
                fileName: string;
                mimeType: string;
                size: number;
            }[];
            read: boolean;
            archived: boolean;
            replies: {
                id: string;
                body: string;
                authorName: string | undefined;
                attachments: {
                    id: string;
                    fileName: string;
                    mimeType: string;
                    size: number;
                }[];
                emailStatus: "sent" | "failed" | "skipped" | undefined;
                createdAt: string | null;
            }[];
            createdAt: string | null;
            lastReplyAt: string | null;
        };
    }>;
    listMine(user: RequestUser): Promise<{
        items: {
            id: string;
            buildingId: string;
            buildingName: string | undefined;
            apartmentId: string;
            apartmentNumber: string | undefined;
            senderName: string | undefined;
            senderEmail: string | undefined;
            senderRole: string;
            category: unknown;
            subject: string;
            body: string;
            attachments: {
                id: string;
                fileName: string;
                mimeType: string;
                size: number;
            }[];
            read: boolean;
            archived: boolean;
            replies: {
                id: string;
                body: string;
                authorName: string | undefined;
                attachments: {
                    id: string;
                    fileName: string;
                    mimeType: string;
                    size: number;
                }[];
                emailStatus: "sent" | "failed" | "skipped" | undefined;
                createdAt: string | null;
            }[];
            createdAt: string | null;
            lastReplyAt: string | null;
        }[];
    }>;
    listForCompany(request: Request, user: RequestUser, buildingId?: string): Promise<{
        items: {
            id: string;
            buildingId: string;
            buildingName: string | undefined;
            apartmentId: string;
            apartmentNumber: string | undefined;
            senderName: string | undefined;
            senderEmail: string | undefined;
            senderRole: string;
            category: unknown;
            subject: string;
            body: string;
            attachments: {
                id: string;
                fileName: string;
                mimeType: string;
                size: number;
            }[];
            read: boolean;
            archived: boolean;
            replies: {
                id: string;
                body: string;
                authorName: string | undefined;
                attachments: {
                    id: string;
                    fileName: string;
                    mimeType: string;
                    size: number;
                }[];
                emailStatus: "sent" | "failed" | "skipped" | undefined;
                createdAt: string | null;
            }[];
            createdAt: string | null;
            lastReplyAt: string | null;
        }[];
        unread: number;
    }>;
    private loadForStaff;
    update(user: RequestUser, messageId: string, body: Data): Promise<{
        item: {
            id: string;
            buildingId: string;
            buildingName: string | undefined;
            apartmentId: string;
            apartmentNumber: string | undefined;
            senderName: string | undefined;
            senderEmail: string | undefined;
            senderRole: string;
            category: unknown;
            subject: string;
            body: string;
            attachments: {
                id: string;
                fileName: string;
                mimeType: string;
                size: number;
            }[];
            read: boolean;
            archived: boolean;
            replies: {
                id: string;
                body: string;
                authorName: string | undefined;
                attachments: {
                    id: string;
                    fileName: string;
                    mimeType: string;
                    size: number;
                }[];
                emailStatus: "sent" | "failed" | "skipped" | undefined;
                createdAt: string | null;
            }[];
            createdAt: string | null;
            lastReplyAt: string | null;
        };
    }>;
    reply(request: Request, user: RequestUser, messageId: string, body: Data, files: UploadedMessageFile[]): Promise<{
        item: {
            id: string;
            buildingId: string;
            buildingName: string | undefined;
            apartmentId: string;
            apartmentNumber: string | undefined;
            senderName: string | undefined;
            senderEmail: string | undefined;
            senderRole: string;
            category: unknown;
            subject: string;
            body: string;
            attachments: {
                id: string;
                fileName: string;
                mimeType: string;
                size: number;
            }[];
            read: boolean;
            archived: boolean;
            replies: {
                id: string;
                body: string;
                authorName: string | undefined;
                attachments: {
                    id: string;
                    fileName: string;
                    mimeType: string;
                    size: number;
                }[];
                emailStatus: "sent" | "failed" | "skipped" | undefined;
                createdAt: string | null;
            }[];
            createdAt: string | null;
            lastReplyAt: string | null;
        };
        emailStatus: "sent" | "failed" | "skipped";
    }>;
    private notifySender;
    attachment(user: RequestUser, messageId: string, attachmentId: string): Promise<{
        buffer: Buffer<ArrayBufferLike>;
        fileName: string;
        contentType: string;
    }>;
}
export {};

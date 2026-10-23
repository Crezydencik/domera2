import { Request, Response } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { UploadedMessageFile } from './messages.types';
import { MessagesService } from './services/messages.service';
export declare class MessagesController {
    private readonly messages;
    constructor(messages: MessagesService);
    list(request: Request, user: RequestUser, buildingId?: string): Promise<{
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
    create(request: Request, user: RequestUser, files: UploadedMessageFile[] | undefined): Promise<{
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
    mine(user: RequestUser): Promise<{
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
    update(user: RequestUser, messageId: string, body: Record<string, unknown>): Promise<{
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
    reply(request: Request, user: RequestUser, messageId: string, files: UploadedMessageFile[] | undefined): Promise<{
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
    attachment(user: RequestUser, messageId: string, attachmentId: string, response: Response): Promise<void>;
}

import { RequestUser } from '../../common/auth/request-user.type';
import { AddSupportMessageDto } from './dto/add-support-message.dto';
import { CreateSupportFeedbackDto } from './dto/create-support-feedback.dto';
import { SupportService } from './support.service';
export declare class SupportController {
    private readonly supportService;
    constructor(supportService: SupportService);
    listFeedback(user: RequestUser, status?: string): Promise<{
        items: {
            id: string;
            userId: {} | null;
            userEmail: {} | null;
            userRole: {} | null;
            companyId: {} | null;
            subject: {};
            message: {};
            priority: {};
            status: {};
            supportContact: {} | null;
            messages: {
                id: string;
                author: string;
                body: string;
                userId: {} | null;
                userEmail: {} | null;
                createdAt: string | null;
            }[];
            completedAt: string | null;
            completedBy: {} | null;
            archivedAt: string | null;
            createdAt: string | null;
            updatedAt: string | null;
        }[];
    }>;
    listOwnFeedback(user: RequestUser): Promise<{
        items: {
            id: string;
            userId: {} | null;
            userEmail: {} | null;
            userRole: {} | null;
            companyId: {} | null;
            subject: {};
            message: {};
            priority: {};
            status: {};
            supportContact: {} | null;
            messages: {
                id: string;
                author: string;
                body: string;
                userId: {} | null;
                userEmail: {} | null;
                createdAt: string | null;
            }[];
            completedAt: string | null;
            completedBy: {} | null;
            archivedAt: string | null;
            createdAt: string | null;
            updatedAt: string | null;
        }[];
    }>;
    createFeedback(user: RequestUser, body: CreateSupportFeedbackDto): Promise<{
        id: string;
        success: boolean;
    }>;
    addMessage(user: RequestUser, feedbackId: string, body: AddSupportMessageDto): Promise<{
        id: string;
        userId: {} | null;
        userEmail: {} | null;
        userRole: {} | null;
        companyId: {} | null;
        subject: {};
        message: {};
        priority: {};
        status: {};
        supportContact: {} | null;
        messages: {
            id: string;
            author: string;
            body: string;
            userId: {} | null;
            userEmail: {} | null;
            createdAt: string | null;
        }[];
        completedAt: string | null;
        completedBy: {} | null;
        archivedAt: string | null;
        createdAt: string | null;
        updatedAt: string | null;
    }>;
    completeFeedback(user: RequestUser, feedbackId: string): Promise<{
        id: string;
        userId: {} | null;
        userEmail: {} | null;
        userRole: {} | null;
        companyId: {} | null;
        subject: {};
        message: {};
        priority: {};
        status: {};
        supportContact: {} | null;
        messages: {
            id: string;
            author: string;
            body: string;
            userId: {} | null;
            userEmail: {} | null;
            createdAt: string | null;
        }[];
        completedAt: string | null;
        completedBy: {} | null;
        archivedAt: string | null;
        createdAt: string | null;
        updatedAt: string | null;
    }>;
}

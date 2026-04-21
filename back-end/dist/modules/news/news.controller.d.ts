import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { NewsService } from './news.service';
export declare class NewsController {
    private readonly newsService;
    constructor(newsService: NewsService);
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, newsId: string): Promise<{
        id: string;
    }>;
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        companyId: string;
        title: string;
        createdAt: Date;
        id: string;
    }>;
    update(request: Request, user: RequestUser, newsId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, newsId: string): Promise<{
        success: boolean;
    }>;
}

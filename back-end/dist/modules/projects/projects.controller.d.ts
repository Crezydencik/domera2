import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { ProjectsService } from './projects.service';
export declare class ProjectsController {
    private readonly projectsService;
    constructor(projectsService: ProjectsService);
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, projectId: string): Promise<{
        id: string;
    }>;
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        companyId: string;
        title: string;
        createdAt: Date;
        id: string;
    }>;
    update(request: Request, user: RequestUser, projectId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, projectId: string): Promise<{
        success: boolean;
    }>;
}

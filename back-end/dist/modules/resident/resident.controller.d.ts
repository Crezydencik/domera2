import { RequestUser } from '../../common/auth/request-user.type';
import { ResidentService } from './resident.service';
export declare class ResidentController {
    private readonly residentService;
    constructor(residentService: ResidentService);
    apartments(user: RequestUser): Promise<{
        apartments: unknown;
        buildings: unknown;
    }>;
}

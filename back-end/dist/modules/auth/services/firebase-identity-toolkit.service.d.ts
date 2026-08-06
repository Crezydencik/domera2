import { ConfigService } from '@nestjs/config';
export declare class FirebaseIdentityToolkitService {
    private readonly configService;
    constructor(configService: ConfigService);
    call<T>(endpoint: string, payload: Record<string, unknown>): Promise<T>;
    private getFirebaseWebApiKey;
    private createServiceError;
}

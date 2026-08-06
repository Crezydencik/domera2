import { ConfigService } from '@nestjs/config';
import { SendEmailDto } from '../dto/send-email.dto';
export declare class EmailTransportService {
    private readonly configService;
    private readonly logger;
    private readonly resend?;
    private readonly from;
    private readonly apiKey;
    constructor(configService: ConfigService);
    send(payload: SendEmailDto): Promise<{
        id: string;
    }>;
}

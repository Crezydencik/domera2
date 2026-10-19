import { HttpException } from '@nestjs/common';
export declare class TooManyRequestsException extends HttpException {
    constructor(resetAt?: number, message?: string);
}

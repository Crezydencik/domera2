import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class AuthExceptionMapperService {
  private readonly logger = new Logger(AuthExceptionMapperService.name);

  mapServiceError(error: unknown): never {
    if (error instanceof HttpException) throw error;

    const message = error instanceof Error ? error.message : 'Unexpected auth error';
    this.logger.error('Auth service error', error instanceof Error ? error.stack : String(error));
    const statusCode = (error as { statusCode?: number } | undefined)?.statusCode;
    const retryAfter = (error as { retryAfter?: number } | undefined)?.retryAfter;

    if (statusCode === 429) {
      throw new HttpException(
        {
          statusCode: 429,
          message,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (statusCode === 401) throw new HttpException({ statusCode: 401, message }, HttpStatus.UNAUTHORIZED);
    if (statusCode === 403) throw new HttpException({ statusCode: 403, message }, HttpStatus.FORBIDDEN);
    if (statusCode === 409) throw new HttpException({ statusCode: 409, message }, HttpStatus.CONFLICT);
    if (statusCode === 404) throw new HttpException({ statusCode: 404, message }, HttpStatus.NOT_FOUND);
    if (statusCode === 410) throw new HttpException({ statusCode: 410, message }, HttpStatus.GONE);
    if (statusCode === 400) throw new BadRequestException(message);

    throw new HttpException({ statusCode: 500, message }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

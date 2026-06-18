import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { PROPERTY_MEMBER_ROLES, STAFF_ROLES } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { DocumentsService } from './documents.service';

type UploadedBinaryFile = {
  fieldname?: string;
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

function buildAsciiFileName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/[";]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'document';
}

function buildContentDisposition(fileName: string) {
  return `inline; filename="${buildAsciiFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@Controller('documents')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('PlatformAdmin', ...STAFF_ROLES, ...PROPERTY_MEMBER_ROLES)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query('apartmentId') apartmentId?: string) {
    return this.documentsService.list(user, { apartmentId });
  }

  @Post('upload')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 } }))
  upload(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @UploadedFiles() uploadedFiles: UploadedBinaryFile[] | undefined,
  ) {
    const file = uploadedFiles?.[0];
    if (!file) throw new BadRequestException('File is required');
    return this.documentsService.upload(request, user, file, request.body as Record<string, unknown>);
  }

  @Get(':documentId/download')
  async download(
    @CurrentUser() user: RequestUser,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    const file = await this.documentsService.download(user, documentId);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', buildContentDisposition(file.fileName));
    response.send(file.buffer);
  }

  @Delete(':documentId')
  remove(@CurrentUser() user: RequestUser, @Param('documentId') documentId: string) {
    return this.documentsService.remove(user, documentId);
  }

  @Patch(':documentId/access')
  updateAccess(
    @CurrentUser() user: RequestUser,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.documentsService.updateAccess(user, documentId, body);
  }
}

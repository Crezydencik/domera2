import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { PROPERTY_MEMBER_ROLES } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { MESSAGE_LIMITS, UploadedMessageFile } from './messages.types';
import { MessagesService } from './services/messages.service';

const FILES = AnyFilesInterceptor({ limits: { fileSize: MESSAGE_LIMITS.fileBytes, files: MESSAGE_LIMITS.files } });

function contentDisposition(fileName: string, contentType: string) {
  const ascii = fileName.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]+/g, '_').replace(/[";]/g, '_').trim() || 'file';
  const inline = contentType === 'application/pdf' || contentType.startsWith('image/');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Обращения жильцов в УК («Входящие»). */
@ApiTags('messages')
@Controller('messages')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(@Req() request: Request, @CurrentUser() user: RequestUser, @Query('buildingId') buildingId?: string) {
    return this.messages.listForCompany(request, user, buildingId);
  }

  @Post()
  @Roles(...PROPERTY_MEMBER_ROLES)
  @UseInterceptors(FILES)
  create(@Req() request: Request, @CurrentUser() user: RequestUser, @UploadedFiles() files: UploadedMessageFile[] | undefined) {
    return this.messages.create(request, user, (request.body ?? {}) as Record<string, unknown>, files ?? []);
  }

  @Get('mine')
  @Roles(...PROPERTY_MEMBER_ROLES)
  mine(@CurrentUser() user: RequestUser) {
    return this.messages.listMine(user);
  }

  @Patch(':messageId')
  update(@CurrentUser() user: RequestUser, @Param('messageId') messageId: string, @Body() body: Record<string, unknown>) {
    if (!body || typeof body !== 'object') throw new BadRequestException('Body is required');
    return this.messages.update(user, messageId, body);
  }

  @Post(':messageId/reply')
  @UseInterceptors(FILES)
  reply(@Req() request: Request, @CurrentUser() user: RequestUser, @Param('messageId') messageId: string, @UploadedFiles() files: UploadedMessageFile[] | undefined) {
    return this.messages.reply(request, user, messageId, (request.body ?? {}) as Record<string, unknown>, files ?? []);
  }

  @Get(':messageId/attachments/:attachmentId')
  @Roles('ManagementCompany', ...PROPERTY_MEMBER_ROLES)
  async attachment(@CurrentUser() user: RequestUser, @Param('messageId') messageId: string, @Param('attachmentId') attachmentId: string, @Res() response: Response) {
    const file = await this.messages.attachment(user, messageId, attachmentId);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('Content-Disposition', contentDisposition(file.fileName, file.contentType));
    response.send(file.buffer);
  }
}

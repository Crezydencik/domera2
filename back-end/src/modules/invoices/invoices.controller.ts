import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { PROPERTY_MEMBER_ROLES, STAFF_ROLES } from '../../common/auth/role.constants';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  CreateInvoiceResponseDto,
  InvoiceUploadErrorResponseDto,
  UploadInvoicesBatchResponseDto,
  ListInvoiceUploadsResponseDto,
  InvoiceItemDto,
  ListInvoicesResponseDto,
} from './dto/invoice-response.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { SuccessResponseDto } from '../../common/dto/success-response.dto';
import { UploadInvoicesBatchDto } from './dto/upload-invoice.dto';
import { InvoiceUploadAuthGuard } from './invoice-upload-auth.guard';

type UploadedBinaryFile = {
  fieldname?: string;
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

const INVOICE_ZIP_MAX_BYTES = 100 * 1024 * 1024;
const INVOICE_BATCH_MAX_FILES = 50;
const INVOICE_ITEMS_MAX_BYTES = 1 * 1024 * 1024;

function invoiceBatchFileFilter(
  _request: Request,
  file: { fieldname?: string; originalname?: string; mimetype?: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const name = file.originalname?.toLowerCase() ?? '';
  const mimetype = file.mimetype?.toLowerCase() ?? '';
  if (file.fieldname === 'items') {
    const looksLikeJson = name.endsWith('.json') || mimetype === 'application/json' || mimetype === 'text/plain';
    if (!looksLikeJson) {
      callback(new BadRequestException('items must be a JSON file'), false);
      return;
    }

    callback(null, true);
    return;
  }

  const looksLikePdf = name.endsWith('.pdf') || mimetype === 'application/pdf';
  const looksLikeZip = name.endsWith('.zip')
    || mimetype === 'application/zip'
    || mimetype === 'application/x-zip-compressed'
    || mimetype === 'multipart/x-zip';

  if (!looksLikePdf && !looksLikeZip) {
    callback(new BadRequestException('Only PDF or ZIP files are allowed'), false);
    return;
  }

  callback(null, true);
}

function readItemsJson(file: UploadedBinaryFile | undefined): string | undefined {
  if (!file) return undefined;

  const size = file.size ?? file.buffer?.length ?? 0;
  if (!file.buffer || size <= 0) {
    throw new BadRequestException('items file is empty');
  }

  if (size > INVOICE_ITEMS_MAX_BYTES) {
    throw new BadRequestException('items JSON file is too large');
  }

  return file.buffer.toString('utf8');
}

@Catch()
class InvoiceUploadExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;

    let error = 'Invoice upload failed';
    if (typeof payload === 'string' && payload.trim()) {
      error = payload;
    } else if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      const message = record.message;
      if (Array.isArray(message)) {
        error = message.join(', ');
      } else if (typeof message === 'string' && message.trim()) {
        error = message;
      } else if (typeof record.error === 'string' && record.error.trim()) {
        error = record.error;
      }
    } else if (exception instanceof Error && exception.message.trim()) {
      error = exception.message;
    }

    response.status(status).json({ success: false, error });
  }
}

@ApiTags('Invoices')
@Controller('invoices')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Create an invoice' })
  @ApiBody({ type: CreateInvoiceDto })
  @ApiOkResponse({
    description: 'Invoice created successfully.',
    type: CreateInvoiceResponseDto,
  })
  create(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(request, user, body as unknown as Record<string, unknown>);
  }

  @Post('upload')
  @UseGuards(InvoiceUploadAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @UseFilters(InvoiceUploadExceptionFilter)
  @UseInterceptors(AnyFilesInterceptor({
    limits: {
      fileSize: INVOICE_ZIP_MAX_BYTES,
      files: INVOICE_BATCH_MAX_FILES + 1,
    },
    fileFilter: invoiceBatchFileFilter,
  }))
  @HttpCode(200)
  @ApiOperation({ summary: 'Upload one invoice PDF, multiple PDFs, or a ZIP archive with billing metadata' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadInvoicesBatchDto })
  @ApiOkResponse({
    description: 'Invoice upload processed.',
    type: UploadInvoicesBatchResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invoice upload failed.',
    type: InvoiceUploadErrorResponseDto,
  })
  upload(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @UploadedFiles() uploadedFiles: UploadedBinaryFile[] | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const uploaded = uploadedFiles ?? [];
    const itemsFile = uploaded.find((file) => file.fieldname === 'items');
    const files = uploaded.filter((file) => file !== itemsFile);

    if (files.length === 0) {
      throw new BadRequestException('File is required');
    }

    const uploadBody: Record<string, unknown> = {
      ...body,
      ...(itemsFile ? { items: readItemsJson(itemsFile) } : {}),
    };
    const hasBatchMetadata = uploadBody.items !== undefined
      || uploadBody.invoices !== undefined
      || uploadBody.metadata !== undefined;
    const isZip = files.some((file) => {
      const name = file.originalname?.toLowerCase() ?? '';
      const mimetype = file.mimetype?.toLowerCase() ?? '';
      return name.endsWith('.zip')
        || mimetype === 'application/zip'
        || mimetype === 'application/x-zip-compressed'
        || mimetype === 'multipart/x-zip';
    });

    if (files.length === 1 && !isZip && !hasBatchMetadata) {
      return this.invoicesService.upload(request, user, files[0]!, uploadBody);
    }

    return this.invoicesService.uploadBatch(request, user, files, uploadBody);
  }

  @Post('upload-batch')
  @UseGuards(InvoiceUploadAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @UseFilters(InvoiceUploadExceptionFilter)
  @UseInterceptors(AnyFilesInterceptor({
    limits: {
      fileSize: INVOICE_ZIP_MAX_BYTES,
      files: INVOICE_BATCH_MAX_FILES + 1,
    },
    fileFilter: invoiceBatchFileFilter,
  }))
  @HttpCode(200)
  @ApiOperation({ summary: 'Upload multiple invoice PDFs with billing metadata' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadInvoicesBatchDto })
  @ApiOkResponse({
    description: 'Invoice batch processed.',
    type: UploadInvoicesBatchResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invoice batch upload failed.',
    type: InvoiceUploadErrorResponseDto,
  })
  uploadBatch(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @UploadedFiles() uploadedFiles: UploadedBinaryFile[] | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const uploaded = uploadedFiles ?? [];
    const itemsFile = uploaded.find((file) => file.fieldname === 'items');
    const files = uploaded.filter((file) => file !== itemsFile);

    if (files.length === 0) {
      throw new BadRequestException('At least one PDF file is required');
    }

    return this.invoicesService.uploadBatch(request, user, files, {
      ...body,
      ...(itemsFile ? { items: readItemsJson(itemsFile) } : {}),
    });
  }

  @Get()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...PROPERTY_MEMBER_ROLES, ...STAFF_ROLES)
  @ApiOperation({ summary: 'List invoices with optional filters' })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'apartmentId', required: false, type: String })
  @ApiQuery({ name: 'buildingId', required: false, type: String })
  @ApiOkResponse({
    description: 'Invoice list returned.',
    type: ListInvoicesResponseDto,
  })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.invoicesService.list(user, query as unknown as Record<string, string | undefined>);
  }

  @Get('uploads')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'List invoice upload/import history' })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'buildingId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({
    description: 'Invoice upload history returned.',
    type: ListInvoiceUploadsResponseDto,
  })
  uploadHistory(
    @CurrentUser() user: RequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.invoicesService.listUploadHistory(user, query);
  }

  @Get('pending-approvals')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'List API invoice uploads waiting for approval' })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'buildingId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({
    description: 'Pending invoice approvals returned.',
  })
  pendingApprovals(
    @CurrentUser() user: RequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.invoicesService.listPendingApprovals(user, query);
  }

  @Get('pending-approvals/:approvalId/pdf')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Open pending invoice approval PDF' })
  @ApiParam({ name: 'approvalId', type: String })
  @ApiOkResponse({
    description: 'Pending invoice PDF returned successfully.',
  })
  async pendingApprovalPdf(
    @CurrentUser() user: RequestUser,
    @Param('approvalId') approvalId: string,
    @Res() response: Response,
  ) {
    const pdf = await this.invoicesService.pendingApprovalPdf(user, approvalId);
    const fallbackFileName = pdf.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '').trim() || 'invoice.pdf';
    const encodedFileName = encodeURIComponent(pdf.fileName);

    response.setHeader('Content-Type', pdf.contentType || 'application/pdf');
    response.setHeader('Content-Length', String(pdf.buffer.length));
    response.setHeader('Content-Disposition', `inline; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(pdf.buffer);
  }

  @Post('pending-approvals/:approvalId/approve')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve API invoice upload and attach it to the apartment' })
  @ApiParam({ name: 'approvalId', type: String })
  @ApiOkResponse({
    description: 'Pending invoice approved.',
    type: SuccessResponseDto,
  })
  approvePendingApproval(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('approvalId') approvalId: string,
  ) {
    return this.invoicesService.approvePendingApproval(request, user, approvalId);
  }

  @Post('pending-approvals/approve-all')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve multiple API invoice uploads' })
  @ApiOkResponse({
    description: 'Pending invoices approved.',
  })
  approvePendingApprovals(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.invoicesService.approvePendingApprovals(request, user, body);
  }

  @Post('pending-approvals/cancel-all')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel multiple API invoice uploads waiting for approval' })
  @ApiOkResponse({
    description: 'Pending invoice approvals cancelled.',
  })
  cancelPendingApprovals(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.invoicesService.cancelPendingApprovals(request, user, body);
  }

  @Delete('pending-approvals/:approvalId')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel API invoice upload waiting for approval' })
  @ApiParam({ name: 'approvalId', type: String })
  @ApiOkResponse({
    description: 'Pending invoice approval cancelled.',
    type: SuccessResponseDto,
  })
  cancelPendingApproval(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('approvalId') approvalId: string,
  ) {
    return this.invoicesService.cancelPendingApproval(request, user, approvalId);
  }

  @Get('public/:token/pdf')
  @ApiOperation({ summary: 'Open invoice PDF by public token' })
  @ApiParam({ name: 'token', type: String })
  @ApiOkResponse({
    description: 'Invoice PDF returned successfully.',
  })
  async publicPdf(
    @Req() request: Request,
    @Param('token') token: string,
    @Res() response: Response,
  ) {
    if (request.query.raw !== '1') {
      response.redirect(302, this.invoicesService.publicInvoiceViewLink(token, request));
      return;
    }

    const pdf = await this.invoicesService.publicPdf(token);
    const fallbackFileName = pdf.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '').trim() || 'invoice.pdf';
    const encodedFileName = encodeURIComponent(pdf.fileName);

    response.setHeader('Content-Type', pdf.contentType || 'application/pdf');
    response.setHeader('Content-Length', String(pdf.buffer.length));
    response.setHeader('Content-Disposition', `inline; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(pdf.buffer);
  }

  @Post(':invoiceId/resend-email')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend invoice email to the apartment recipient' })
  @ApiParam({ name: 'invoiceId', type: String })
  @ApiOkResponse({
    description: 'Invoice email resent successfully.',
    type: SuccessResponseDto,
  })
  resendEmail(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.invoicesService.resendEmail(request, user, invoiceId);
  }

  @Get(':invoiceId/pdf')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...PROPERTY_MEMBER_ROLES, ...STAFF_ROLES)
  @ApiOperation({ summary: 'Open invoice PDF by id' })
  @ApiParam({ name: 'invoiceId', type: String })
  @ApiOkResponse({
    description: 'Invoice PDF returned successfully.',
  })
  async pdf(
    @CurrentUser() user: RequestUser,
    @Param('invoiceId') invoiceId: string,
    @Res() response: Response,
  ) {
    const pdf = await this.invoicesService.pdf(user, invoiceId);
    const fallbackFileName = pdf.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '').trim() || 'invoice.pdf';
    const encodedFileName = encodeURIComponent(pdf.fileName);

    response.setHeader('Content-Type', pdf.contentType || 'application/pdf');
    response.setHeader('Content-Length', String(pdf.buffer.length));
    response.setHeader('Content-Disposition', `inline; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(pdf.buffer);
  }

  @Get(':invoiceId')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...PROPERTY_MEMBER_ROLES, ...STAFF_ROLES)
  @ApiOperation({ summary: 'Get invoice by id' })
  @ApiParam({ name: 'invoiceId', type: String })
  @ApiOkResponse({
    description: 'Invoice returned successfully.',
    type: InvoiceItemDto,
  })
  byId(@CurrentUser() user: RequestUser, @Param('invoiceId') invoiceId: string) {
    return this.invoicesService.byId(user, invoiceId);
  }

  @Patch(':invoiceId')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Update invoice fields' })
  @ApiParam({ name: 'invoiceId', type: String })
  @ApiBody({ type: UpdateInvoiceDto })
  @ApiOkResponse({
    description: 'Invoice updated successfully.',
    type: SuccessResponseDto,
  })
  update(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('invoiceId') invoiceId: string,
    @Body() body: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(request, user, invoiceId, body as unknown as Record<string, unknown>);
  }

  @Delete(':invoiceId')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Delete invoice' })
  @ApiParam({ name: 'invoiceId', type: String })
  @ApiOkResponse({
    description: 'Invoice deleted successfully.',
    type: SuccessResponseDto,
  })
  remove(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.invoicesService.remove(request, user, invoiceId);
  }
}

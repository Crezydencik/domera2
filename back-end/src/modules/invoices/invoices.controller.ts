import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
  InvoiceItemDto,
  ListInvoicesResponseDto,
} from './dto/invoice-response.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { SuccessResponseDto } from '../../common/dto/success-response.dto';

@ApiTags('Invoices')
@Controller('invoices')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
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

  @Get()
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

  @Get(':invoiceId')
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

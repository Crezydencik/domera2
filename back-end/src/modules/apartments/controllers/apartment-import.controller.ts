import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ApartmentsService } from '../apartments.service';
import { ImportApartmentsDto } from '../dto/import-apartments.dto';
import { ImportApartmentsResponseDto } from '../dto/import-apartments-response.dto';

type UploadedBinaryFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

const APARTMENT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const APARTMENT_IMPORT_EXTENSIONS = new Set(['.csv', '.json', '.xml', '.xlsx']);
const APARTMENT_IMPORT_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/json',
  'application/xml',
  'text/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function apartmentImportFileFilter(
  _request: Request,
  file: { originalname?: string; mimetype?: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const name = file.originalname?.toLowerCase() ?? '';
  const mimeType = file.mimetype?.toLowerCase() ?? '';
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';

  if (APARTMENT_IMPORT_EXTENSIONS.has(extension) || APARTMENT_IMPORT_MIME_TYPES.has(mimeType)) {
    callback(null, true);
    return;
  }

  callback(new BadRequestException('Only CSV, JSON, XML, and XLSX files are allowed'), false);
}

@ApiTags('Apartments')
@Controller('apartments')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class ApartmentImportController {
  constructor(private readonly apartmentsService: ApartmentsService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: APARTMENT_IMPORT_MAX_BYTES, files: 1 },
    fileFilter: apartmentImportFileFilter,
  }))
  @ApiOperation({ summary: 'Import apartments from CSV, JSON, XML or XLSX file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'buildingId', 'companyId'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        buildingId: { type: 'string' },
        companyId: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Apartment import finished successfully.',
    type: ImportApartmentsResponseDto,
  })
  importApartments(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @Body() body: ImportApartmentsDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.apartmentsService.importFromFile({
      request,
      user,
      file,
      buildingId: body.buildingId,
      companyId: body.companyId,
    });
  }
}

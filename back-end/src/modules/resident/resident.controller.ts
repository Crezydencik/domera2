import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { PROPERTY_MEMBER_ROLES } from '../../common/auth/role.constants';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ResidentService } from './resident.service';
import { ResidentApartmentsResponseDto } from './dto/resident-response.dto';

@ApiTags('Resident')
@Controller('resident')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(...PROPERTY_MEMBER_ROLES)
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class ResidentController {
  constructor(private readonly residentService: ResidentService) {}

  @Get('apartments')
  @ApiOperation({ summary: 'Get resident apartments and related buildings' })
  @ApiOkResponse({
    description: 'Resident apartments returned successfully.',
    type: ResidentApartmentsResponseDto,
  })
  apartments(@CurrentUser() user: RequestUser) {
    return this.residentService.apartments(user);
  }
}

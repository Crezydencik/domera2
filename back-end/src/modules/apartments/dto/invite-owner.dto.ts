import { IsOptional, IsString } from 'class-validator';

export class InviteOwnerDto {
  @IsString()
  email!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  contractNumber?: string;
}

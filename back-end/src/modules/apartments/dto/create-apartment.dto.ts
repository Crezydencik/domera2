import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class ApartmentReadingConfigOverrideDto {
  @IsBoolean()
  useBuildingDefaults!: boolean;

  @IsNumber()
  @Min(0)
  hotWaterMeters!: number;

  @IsNumber()
  @Min(0)
  coldWaterMeters!: number;
}

export class CreateApartmentDto {
  @IsString()
  @MaxLength(30)
  number!: string;

  @IsString()
  buildingId!: string;

  @IsString()
  companyId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  floor?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  area?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  declaredResidents?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ApartmentReadingConfigOverrideDto)
  readingConfigOverride?: ApartmentReadingConfigOverrideDto;
}

export class UpdateApartmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  number?: string;

  @IsOptional()
  @IsString()
  buildingId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  floor?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  area?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  declaredResidents?: number;

  @IsOptional()
  @IsString()
  cadastralNumber?: string;

  @IsOptional()
  @IsString()
  cadastralPart?: string;

  @IsOptional()
  @IsString()
  commonPropertyShare?: string;

  @IsOptional()
  @IsString()
  apartmentType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heatingArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  managementArea?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ApartmentReadingConfigOverrideDto)
  readingConfigOverride?: ApartmentReadingConfigOverrideDto;

  @IsOptional()
  @IsObject()
  waterReadings?: Record<string, unknown>;
}

import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupportFeedbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  message!: string;

  @IsOptional()
  @IsString()
  @IsIn(['low', 'normal', 'high'])
  priority?: 'low' | 'normal' | 'high';
}

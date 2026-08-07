import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  message!: string;
}

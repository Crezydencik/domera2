import { ApiProperty } from '@nestjs/swagger';

export class RegisterEmailCodeRequestResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 3600 })
  expiresInSeconds!: number;
}

export class RegisterEmailCodeVerifyResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty()
  verificationToken!: string;

  @ApiProperty({ example: 3600 })
  expiresInSeconds!: number;
}

export class SendPasswordResetResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Vēstule nosūtīta' })
  message!: string;
}

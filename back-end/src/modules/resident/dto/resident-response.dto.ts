import { ApiProperty } from '@nestjs/swagger';

export class SerializableObjectDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
  })
  value!: Record<string, unknown>;
}

export class ResidentApartmentsResponseDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: true,
    },
  })
  apartments!: Record<string, unknown>[];

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: true,
    },
  })
  buildings!: Record<string, unknown>[];
}

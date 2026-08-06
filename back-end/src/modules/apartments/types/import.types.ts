import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';

export type ParsedReading = {
  label: string;
  value: number;
  month: number;
  year: number;
};

export type ImportInput = {
  request: Request;
  user: RequestUser;
  file: {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
  };
  buildingId?: string;
  companyId?: string;
};

export type ImportRow = Record<string, unknown>;

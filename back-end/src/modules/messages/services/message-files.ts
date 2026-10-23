import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { MESSAGE_LIMITS, MessageAttachment, UploadedMessageFile } from '../messages.types';

/** Тип по содержимому файла (не по имени): PDF, JPG, PNG. */
export function detectMessageMime(buffer: Buffer): string {
  if (!buffer || buffer.length < 4) throw new BadRequestException('File is empty');
  if (buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return 'application/pdf';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  throw new BadRequestException('Only PDF, JPG and PNG attachments are allowed');
}

export function sanitizeFileName(value: unknown): string {
  const name = typeof value === 'string' ? value : '';
  // Multer отдаёт имя в latin1: восстанавливаем UTF-8 (кириллица, латышские буквы).
  const decoded = /[\u0080-ÿ]/.test(name) ? Buffer.from(name, 'latin1').toString('utf8') : name;
  const cleaned = decoded.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || 'file';
}

const segment = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'x';

/** Проверяет и сохраняет вложения в Storage. При ошибке удаляет уже сохранённые. */
export async function storeMessageFiles(
  firebase: FirebaseAdminService,
  files: UploadedMessageFile[],
  pathBase: string[],
): Promise<MessageAttachment[]> {
  if (files.length > MESSAGE_LIMITS.files) throw new BadRequestException(`At most ${MESSAGE_LIMITS.files} attachments are allowed`);
  const prepared = files.map((file) => {
    const size = file.size ?? file.buffer?.length ?? 0;
    if (!file.buffer || size <= 0) throw new BadRequestException('File is empty');
    if (size > MESSAGE_LIMITS.fileBytes) throw new BadRequestException('Attachment is too large');
    return { file, size, mimeType: detectMessageMime(file.buffer), fileName: sanitizeFileName(file.originalname) };
  });

  const bucket = firebase.storageBucket;
  const saved: MessageAttachment[] = [];
  try {
    for (const item of prepared) {
      const id = `att_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const storagePath = [...pathBase.map(segment), id, segment(item.fileName)].join('/');
      await bucket.file(storagePath).save(item.file.buffer, { resumable: false, metadata: { contentType: item.mimeType } });
      saved.push({ id, fileName: item.fileName, mimeType: item.mimeType, size: item.size, storagePath, storageBucket: bucket.name });
    }
  } catch (error) {
    await Promise.all(saved.map((a) => bucket.file(a.storagePath).delete({ ignoreNotFound: true }).catch(() => null)));
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Could not store attachment');
  }
  return saved;
}

export async function deleteMessageFiles(firebase: FirebaseAdminService, attachments: MessageAttachment[]) {
  await Promise.all(
    attachments.map((a) =>
      (a.storageBucket ? firebase.storage.bucket(a.storageBucket) : firebase.storageBucket).file(a.storagePath).delete({ ignoreNotFound: true }).catch(() => null),
    ),
  );
}

/** Вложение без внутренних путей хранилища — для ответа API. */
export const publicAttachment = (a: MessageAttachment) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size });

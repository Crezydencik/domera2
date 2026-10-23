"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicAttachment = void 0;
exports.detectMessageMime = detectMessageMime;
exports.sanitizeFileName = sanitizeFileName;
exports.storeMessageFiles = storeMessageFiles;
exports.deleteMessageFiles = deleteMessageFiles;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const messages_types_1 = require("../messages.types");
function detectMessageMime(buffer) {
    if (!buffer || buffer.length < 4)
        throw new common_1.BadRequestException('File is empty');
    if (buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46])))
        return 'application/pdf';
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
        return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return 'image/png';
    throw new common_1.BadRequestException('Only PDF, JPG and PNG attachments are allowed');
}
function sanitizeFileName(value) {
    const name = typeof value === 'string' ? value : '';
    const decoded = /[\u0080-ÿ]/.test(name) ? Buffer.from(name, 'latin1').toString('utf8') : name;
    const cleaned = decoded.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
    return cleaned || 'file';
}
const segment = (value) => value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'x';
async function storeMessageFiles(firebase, files, pathBase) {
    if (files.length > messages_types_1.MESSAGE_LIMITS.files)
        throw new common_1.BadRequestException(`At most ${messages_types_1.MESSAGE_LIMITS.files} attachments are allowed`);
    const prepared = files.map((file) => {
        const size = file.size ?? file.buffer?.length ?? 0;
        if (!file.buffer || size <= 0)
            throw new common_1.BadRequestException('File is empty');
        if (size > messages_types_1.MESSAGE_LIMITS.fileBytes)
            throw new common_1.BadRequestException('Attachment is too large');
        return { file, size, mimeType: detectMessageMime(file.buffer), fileName: sanitizeFileName(file.originalname) };
    });
    const bucket = firebase.storageBucket;
    const saved = [];
    try {
        for (const item of prepared) {
            const id = `att_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
            const storagePath = [...pathBase.map(segment), id, segment(item.fileName)].join('/');
            await bucket.file(storagePath).save(item.file.buffer, { resumable: false, metadata: { contentType: item.mimeType } });
            saved.push({ id, fileName: item.fileName, mimeType: item.mimeType, size: item.size, storagePath, storageBucket: bucket.name });
        }
    }
    catch (error) {
        await Promise.all(saved.map((a) => bucket.file(a.storagePath).delete({ ignoreNotFound: true }).catch(() => null)));
        if (error instanceof common_1.BadRequestException)
            throw error;
        throw new common_1.BadRequestException('Could not store attachment');
    }
    return saved;
}
async function deleteMessageFiles(firebase, attachments) {
    await Promise.all(attachments.map((a) => (a.storageBucket ? firebase.storage.bucket(a.storageBucket) : firebase.storageBucket).file(a.storagePath).delete({ ignoreNotFound: true }).catch(() => null)));
}
const publicAttachment = (a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size });
exports.publicAttachment = publicAttachment;

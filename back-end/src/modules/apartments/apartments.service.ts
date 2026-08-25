import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Workbook } from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { isPropertyMemberRole, normalizeUserRole } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { EmailService } from '../emails/services/email.service';
import { CreateApartmentDto, UpdateApartmentDto } from './dto/create-apartment.dto';
import { ApartmentsRepository } from './repositories/apartments.repository';
import { ApartmentAccessService } from './services/apartment-access.service';
import { ApartmentCodeService } from './services/apartment-code.service';
import { ApartmentInvitationService } from './services/apartment-invitation.service';
import { ApartmentMeterService } from './services/apartment-meter.service';
import { ApartmentStorageService } from './services/apartment-storage.service';
import { ApartmentCodeContext, ApartmentWriteOperation } from './types/apartment.types';
import { ImportInput, ImportRow, ParsedReading } from './types/import.types';
const APARTMENT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const APARTMENT_IMPORT_MAX_ROWS = 5_000;

@Injectable()
export class ApartmentsService {
  private readonly logger = new Logger(ApartmentsService.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
    private readonly apartmentsRepository: ApartmentsRepository,
    private readonly apartmentAccessService: ApartmentAccessService,
    private readonly apartmentCodeService: ApartmentCodeService,
    private readonly apartmentInvitationService: ApartmentInvitationService,
    private readonly apartmentMeterService: ApartmentMeterService,
    private readonly apartmentStorageService: ApartmentStorageService,
  ) {}

  private async enforceRateLimit(
    request: Request,
    scope: string,
    discriminator: string,
    limit: number,
  ): Promise<void> {
    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, scope, discriminator),
      limit,
      60_000,
    );

    if (!rl.allowed) {
      throw new BadRequestException('Too many requests');
    }
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return '';
  }

  private compareApartmentOrder(left: Record<string, unknown>, right: Record<string, unknown>): number {
    const leftLabel = this.firstString(left.number, left.apartmentNumber, left.id, left.apartmentId);
    const rightLabel = this.firstString(right.number, right.apartmentNumber, right.id, right.apartmentId);
    const leftNumber = Number(leftLabel);
    const rightNumber = Number(rightLabel);
    const bothNumeric =
      leftLabel !== '' &&
      rightLabel !== '' &&
      Number.isFinite(leftNumber) &&
      Number.isFinite(rightNumber);

    if (bothNumeric && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: 'base' });
  }

  private sortApartmentItems<T extends Record<string, unknown>>(items: T[]): T[] {
    return [...items].sort((left, right) => this.compareApartmentOrder(left, right));
  }

  private timestampMillis(value: unknown): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') {
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const seconds =
        typeof record.seconds === 'number'
          ? record.seconds
          : typeof record._seconds === 'number'
            ? record._seconds
            : undefined;
      if (typeof seconds === 'number') return seconds * 1000;
      const toDate = record.toDate;
      if (typeof toDate === 'function') {
        try {
          const date = toDate.call(value) as unknown;
          return date instanceof Date ? date.getTime() : 0;
        } catch {
          return 0;
        }
      }
    }

    return 0;
  }

  private async withOwnerInvitationDates<T extends Record<string, unknown>>(items: T[]): Promise<T[]> {
    const missingOwnerInvitationDates = items.filter((item) => {
      const apartmentId = this.firstString(item.id, item.apartmentId);
      const ownerEmail = this.firstString(item.ownerEmail);
      return apartmentId && ownerEmail && !item.ownerInvitedAt;
    });

    if (missingOwnerInvitationDates.length === 0) return items;

    const latestByApartment = new Map<string, { date: unknown; invitationId: string; millis: number }>();
    const apartmentIds = Array.from(
      new Set(missingOwnerInvitationDates.map((item) => this.firstString(item.id, item.apartmentId)).filter(Boolean)),
    );
    const ownerEmailByApartment = new Map(
      missingOwnerInvitationDates.map((item) => [
        this.firstString(item.id, item.apartmentId),
        this.firstString(item.ownerEmail).toLowerCase(),
      ]),
    );

    for (let index = 0; index < apartmentIds.length; index += 30) {
      const chunk = apartmentIds.slice(index, index + 30);
      if (chunk.length === 0) continue;

      const invitations = await this.firebaseAdminService.firestore
        .collection('invitations')
        .where('apartmentId', 'in', chunk)
        .get();

      for (const invitationDoc of invitations.docs) {
        const invitation = invitationDoc.data() as Record<string, unknown>;
        const apartmentId = this.firstString(invitation.apartmentId);
        const ownerEmail = ownerEmailByApartment.get(apartmentId);
        if (!apartmentId || !ownerEmail) continue;

        const invitationEmail = this.firstString(invitation.email).toLowerCase();
        const inviteType = this.firstString(invitation.inviteType).toLowerCase();
        const role = this.firstString(invitation.role).toLowerCase();
        const isOwnerInvitation = inviteType === 'owner' || role === 'landlord';
        if (!isOwnerInvitation || invitationEmail !== ownerEmail) continue;

        const date = invitation.createdAt ?? invitation.invitedAt;
        const millis = this.timestampMillis(date);
        if (!millis) continue;

        const current = latestByApartment.get(apartmentId);
        if (!current || millis > current.millis) {
          latestByApartment.set(apartmentId, { date, invitationId: invitationDoc.id, millis });
        }
      }
    }

    if (latestByApartment.size === 0) return items;

    return items.map((item) => {
      if (item.ownerInvitedAt) return item;
      const apartmentId = this.firstString(item.id, item.apartmentId);
      const invitation = latestByApartment.get(apartmentId);
      if (!invitation) return item;

      return {
        ...item,
        ownerInvitedAt: invitation.date,
        ownerInvitationId: item.ownerInvitationId ?? invitation.invitationId,
      };
    });
  }

  private async withResolvedOwnerAccess<T extends Record<string, unknown>>(items: T[]): Promise<T[]> {
    const missingOwnerLinks = items.filter((item) => {
      const apartmentId = this.firstString(item.id, item.apartmentId);
      const ownerEmail = this.firstString(item.ownerEmail).toLowerCase();
      const ownerId = this.firstString(item.ownerId);
      return apartmentId && ownerEmail && !ownerId;
    });

    if (missingOwnerLinks.length === 0) return items;

    const emails = Array.from(
      new Set(missingOwnerLinks.map((item) => this.firstString(item.ownerEmail).toLowerCase()).filter(Boolean)),
    );
    const userIdByEmail = new Map<string, string>();

    for (let index = 0; index < emails.length; index += 30) {
      const chunk = emails.slice(index, index + 30);
      if (chunk.length === 0) continue;

      const usersSnap = await this.firebaseAdminService.firestore
        .collection('users')
        .where('email', 'in', chunk)
        .get();

      for (const doc of usersSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const email = this.firstString(data.email).toLowerCase();
        if (email && !userIdByEmail.has(email)) {
          userIdByEmail.set(email, doc.id);
        }
      }
    }

    await Promise.all(
      emails
        .filter((email) => !userIdByEmail.has(email))
        .map(async (email) => {
          try {
            const user = await this.firebaseAdminService.auth.getUserByEmail(email);
            userIdByEmail.set(email, user.uid);
          } catch {
            // No auth user exists for this email, so the owner is still invitation-only.
          }
        }),
    );

    if (userIdByEmail.size === 0) return items;

    const nextItems = items.map((item) => {
      const apartmentId = this.firstString(item.id, item.apartmentId);
      const ownerEmail = this.firstString(item.ownerEmail).toLowerCase();
      const resolvedOwnerId = ownerEmail ? userIdByEmail.get(ownerEmail) : undefined;
      if (!apartmentId || !resolvedOwnerId) return item;

      const ownerId = this.firstString(item.ownerId);
      if (ownerId) return item;

      return {
        ...item,
        ownerId: resolvedOwnerId,
      };
    });

    return nextItems;
  }

  private getBuildingStorageFolders(companyId: string, buildingId: string): string[] {
    return this.apartmentStorageService.getBuildingStorageFolders(companyId, buildingId);
  }

  private getApartmentStorageFolders(companyId: string, buildingId: string, apartmentId: string): string[] {
    return this.apartmentStorageService.getApartmentStorageFolders(companyId, buildingId, apartmentId);
  }

  private getApartmentStorageFolderPath(companyId: string, buildingId: string, apartmentId: string): string {
    return this.apartmentStorageService.getApartmentStorageFolderPath(companyId, buildingId, apartmentId);
  }

  private resolveApartmentStorageContext(apartmentId: string, data: Record<string, unknown>) {
    return this.apartmentStorageService.resolveApartmentStorageContext(apartmentId, data);
  }

  private async markStorageFolders(
    ref: FirebaseFirestore.DocumentReference,
    folderPaths: string[],
    entityLabel: string,
  ): Promise<void> {
    return this.apartmentStorageService.markStorageFolders(ref, folderPaths, entityLabel);
  }

  private async getApprovedBuildingOrThrow(buildingId: string, companyId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) {
      throw new ForbiddenException('Apartments can be added only after the building request is approved');
    }

    const data = snap.data() as Record<string, unknown>;
    const buildingCompanyId =
      (typeof data.companyId === 'string' ? data.companyId.trim() : '') ||
      ((data.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined)?.trim() ||
      '';

    if (!buildingCompanyId || buildingCompanyId !== companyId) {
      throw new ForbiddenException('Access denied for building/company ownership');
    }

    if (data.editLocked === true) {
      throw new ForbiddenException('This building is locked by the platform administrator');
    }

    const status = this.firstString(data.status).toLowerCase();
    if (['pending', 'rejected', 'cancelled', 'canceled'].includes(status)) {
      throw new ForbiddenException('Apartments can be added only after the building request is approved');
    }

    return data;
  }

  private getBuildingApartmentLimit(building: Record<string, unknown>): number | undefined {
    for (const value of [building.apartmentsCount, building.apartments]) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }

    return undefined;
  }

  private async countBuildingApartments(buildingId: string, excludeApartmentId?: string): Promise<number> {
    const db = this.firebaseAdminService.firestore;
    const [byBuildingId, byLegacyHouseId] = await Promise.all([
      db.collection('apartments').where('buildingId', '==', buildingId).get(),
      db.collection('apartments').where('houseId', '==', buildingId).get(),
    ]);

    const ids = new Set<string>();
    for (const doc of [...byBuildingId.docs, ...byLegacyHouseId.docs]) {
      if (excludeApartmentId && doc.id === excludeApartmentId) continue;
      ids.add(doc.id);
    }

    return ids.size;
  }

  private async assertBuildingApartmentCapacity(params: {
    buildingId: string;
    building: Record<string, unknown>;
    additionalApartments: number;
    excludeApartmentId?: string;
  }): Promise<void> {
    const limit = this.getBuildingApartmentLimit(params.building);
    if (limit === undefined || params.additionalApartments <= 0) {
      return;
    }

    const existingCount = await this.countBuildingApartments(params.buildingId, params.excludeApartmentId);
    if (existingCount + params.additionalApartments > limit) {
      throw new ConflictException(
        `Apartment limit for this building is ${limit}. Edit the building and wait for approval before adding more apartments.`,
      );
    }
  }

  private async assertApartmentBuildingEditableForStaff(user: RequestUser, apartment: Record<string, unknown>) {
    return this.apartmentAccessService.assertApartmentBuildingEditableForStaff(user, apartment);
  }

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    return this.apartmentAccessService.assertAuthenticated(user);
  }

  private assertManagementCompanyMutation(user: RequestUser): void {
    return this.apartmentAccessService.assertManagementCompanyMutation(user);
  }

  private isStaff(user: RequestUser): boolean {
    return this.apartmentAccessService.isStaff(user);
  }

  private effectiveStaffCompanyId(user: RequestUser): string {
    return this.apartmentAccessService.effectiveStaffCompanyId(user);
  }

  private apartmentBelongsToStaffCompany(user: RequestUser, apartment: Record<string, unknown>): boolean {
    return this.apartmentAccessService.apartmentBelongsToStaffCompany(user, apartment);
  }

  private assertApartmentCompanyAccess(user: RequestUser, apartment: Record<string, unknown>): void {
    return this.apartmentAccessService.assertApartmentCompanyAccess(user, apartment);
  }

  private async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    return this.apartmentAccessService.getAccessibleApartmentIds(user);
  }

  private canManageTenants(user: RequestUser, apartmentId: string, apartment: Record<string, unknown>): boolean {
    void apartmentId;
    return this.apartmentAccessService.canManageTenants(user, apartment);
  }

  private hasApartmentOccupant(apartment: Record<string, unknown>): boolean {
    return this.apartmentAccessService.hasApartmentOccupant(apartment);
  }

  private normalizeHeader(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeApartmentNumber(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private normalizeReadingConfigOverride(payload: { readingConfigOverride?: unknown }) {
    return this.apartmentMeterService.normalizeReadingConfigOverride(payload);
  }

  private buildEmptyWaterReadings(
    apartmentId: string,
    buildingId: string,
    building: Record<string, unknown>,
    readingConfigOverride?: { useBuildingDefaults: boolean; hotWaterMeters: number; coldWaterMeters: number },
  ): Record<string, unknown> {
    return this.apartmentMeterService.buildEmptyWaterReadings(apartmentId, buildingId, building, readingConfigOverride);
  }

  /**
   * Generate a readable ID for apartment.
   * Format: 3 company letters - 4 random digits - apartment number - 4 building letters - 3 random digits.
   * Example: DOM-4821-42-MAIN-739
   */
  private buildReadableCode(value: unknown, length: number, fallback: string): string {
    return this.apartmentCodeService.buildReadableCode(value, length, fallback);
  }

  private buildRandomDigits(length: number): string {
    return this.apartmentCodeService.buildRandomDigits(length);
  }

  private buildApartmentNumberCode(apartmentNumber: string | number): string {
    return this.apartmentCodeService.buildApartmentNumberCode(apartmentNumber);
  }

  private async getApartmentCodeContext(companyId: string, buildingId: string): Promise<ApartmentCodeContext> {
    return this.apartmentCodeService.getApartmentCodeContext(companyId, buildingId);
  }

  private buildApartmentReadableId(context: ApartmentCodeContext, apartmentNumber: string | number): string {
    return this.apartmentCodeService.buildApartmentReadableId(context, apartmentNumber);
  }

  private async generateApartmentReadableId(
    companyId: string,
    buildingId: string,
    apartmentNumber: string | number,
  ): Promise<string> {
    return this.apartmentCodeService.generateApartmentReadableId(companyId, buildingId, apartmentNumber);
  }

  private getCellStringByHeader(row: Record<string, unknown>, headerCandidates: string[]): string {
    for (const header of headerCandidates) {
      const raw = row[header];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        return String(raw).trim();
      }
    }

    const normalizedCandidates = new Set(headerCandidates.map((header) => this.normalizeHeader(header)));
    for (const key of Object.keys(row)) {
      if (normalizedCandidates.has(this.normalizeHeader(key))) {
        const raw = row[key];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
          return String(raw).trim();
        }
      }
    }

    return '';
  }

  private parseReadingPeriod(label: string): { month: number; year: number } | null {
    const normalized = label.trim();

    const monthYearMatch = normalized.match(/(\d{1,2})[.\-/](\d{4})/);
    if (monthYearMatch) {
      const month = Number(monthYearMatch[1]);
      const year = Number(monthYearMatch[2]);
      if (month >= 1 && month <= 12) return { month, year };
    }

    const yearMonthMatch = normalized.match(/(\d{4})[.\-/](\d{1,2})/);
    if (yearMonthMatch) {
      const year = Number(yearMonthMatch[1]);
      const month = Number(yearMonthMatch[2]);
      if (month >= 1 && month <= 12) return { month, year };
    }

    return null;
  }

  private parsePeriodFromDateCell(raw: unknown): { month: number; year: number } | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      if (raw >= 20000 && raw <= 70000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + raw * 24 * 60 * 60 * 1000);
        if (!Number.isNaN(date.getTime())) {
          return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
        }
      }
    }

    const text = String(raw).trim();
    const fullDate = text.match(/^((\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})|(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4}))$/);
    if (fullDate) {
      const y = fullDate[2] ? Number(fullDate[2]) : Number(fullDate[7]);
      const m = fullDate[3] ? Number(fullDate[3]) : Number(fullDate[6]);
      if (m >= 1 && m <= 12) return { month: m, year: y };
    }

    const byText = this.parseReadingPeriod(text);
    if (byText) return byText;

    const dayMonth = text.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
    if (dayMonth) {
      const month = Number(dayMonth[2]);
      if (month >= 1 && month <= 12) {
        return { month, year: new Date().getFullYear() };
      }
    }

    return null;
  }

  private extractReadings(row: Record<string, unknown>, prefix: 'Kartsais' | 'Aukstais'): ParsedReading[] {
    const entries = Object.entries(row);
    const out: ParsedReading[] = [];
    const isDateHeader = (header: string): boolean => {
      const n = this.normalizeHeader(header);
      return n.startsWith('data') || n.includes('date') || n.includes('menesis') || n.includes('month');
    };
    const isLikelyDateColumn = (header: string): boolean => {
      const n = this.normalizeHeader(header);
      return isDateHeader(header) || n === '' || n.startsWith('__empty');
    };
    const periodAt = (index: number): { period: { month: number; year: number }; label: string } | null => {
      const candidate = entries[index];
      if (!candidate) return null;

      const [dateColName, dateValue] = candidate;
      if (!isLikelyDateColumn(dateColName)) return null;

      const parsed = this.parsePeriodFromDateCell(dateValue);
      if (!parsed) return null;

      return {
        period: parsed,
        label: String(dateValue ?? dateColName).trim() || dateColName,
      };
    };

    const findNearestPeriod = (index: number): { period: { month: number; year: number }; label: string } | null => {
      const next = periodAt(index + 1);
      if (next) return next;

      const previous = periodAt(index - 1);
      if (previous) return previous;

      let best: { distance: number; period: { month: number; year: number }; label: string } | null = null;

      for (let j = 0; j < entries.length; j++) {
        if (j === index) continue;
        const candidate = periodAt(j);
        if (!candidate) continue;

        const distance = Math.abs(j - index);

        if (!best || distance < best.distance || (distance === best.distance && j > index)) {
          best = { distance, period: candidate.period, label: candidate.label };
        }
      }

      return best ? { period: best.period, label: best.label } : null;
    };

    for (let i = 0; i < entries.length; i++) {
      const [colName, value] = entries[i];
      if (
        typeof colName !== 'string' ||
        !colName.includes(prefix) ||
        colName.includes('NR') ||
        value === undefined ||
        value === null ||
        String(value).trim() === ''
      ) {
        continue;
      }

      const numValue = Number.parseFloat(String(value).replace(',', '.'));
      if (!Number.isFinite(numValue)) continue;

      let period = this.parseReadingPeriod(colName);
      let label = colName.trim();
      if (!period) {
        const nearest = findNearestPeriod(i);
        if (nearest) {
          period = nearest.period;
          label = nearest.label || colName.trim();
        }
      }
      if (!period) continue;

      out.push({ label, value: numValue, month: period.month, year: period.year });
    }

    return out.sort((a, b) => a.year - b.year || a.month - b.month);
  }

  private buildSubmittedAtFromPeriod(year: number, month: number): Date {
    const now = new Date();
    const currentDay = now.getDate();
    const daysInTargetMonth = new Date(year, month, 0).getDate();
    const safeDay = Math.min(currentDay, daysInTargetMonth);
    return new Date(year, month - 1, safeDay, 12, 0, 0, 0);
  }

  private findDueDateFromRow(row: Record<string, unknown>, type: 'hot' | 'cold'): string {
    const keys = Object.keys(row);
    const meterToken = type === 'hot' ? 'kartsais' : 'aukstais';

    const dueDateKey = keys.find((key) => {
      const k = this.normalizeHeader(key);
      return (
        k.includes(meterToken) &&
        ((k.includes('derig') && k.includes('lidz')) ||
          k.includes('check due') ||
          k.includes('checkduedate') ||
          k.includes('expiry') ||
          k.includes('valid until'))
      );
    });

    if (!dueDateKey) return '';
    const raw = row[dueDateKey];
    return raw === undefined || raw === null ? '' : String(raw).trim();
  }

  private buildWaterReadingGroup({
    apartmentId,
    buildingId,
    meterId,
    serialNumber,
    checkDueDate,
    readings,
  }: {
    apartmentId: string;
    buildingId: string;
    meterId: string;
    serialNumber: string;
    checkDueDate?: string;
    readings: ParsedReading[];
  }) {
    const history = readings.map((reading, index) => {
      const previousValue = index > 0 ? readings[index - 1].value : 0;
      const consumption = index > 0 ? Math.max(0, reading.value - previousValue) : 0;
      const submittedAt = this.buildSubmittedAtFromPeriod(reading.year, reading.month);

      return {
          id: randomUUID(),
        apartmentId,
        buildingId,
        meterId,
        previousValue,
        currentValue: reading.value,
        consumption,
        month: reading.month,
        year: reading.year,
        submittedAt,
      };
    });

    return {
      meterId,
      serialNumber,
      checkDueDate: checkDueDate || '',
      history,
    };
  }

  private getFileExtension(file?: { originalname?: string; mimetype?: string }) {
    const fileName = typeof file?.originalname === 'string' ? file.originalname.toLowerCase() : '';
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex) : '';
  }

  private getValueByPath(source: Record<string, unknown>, paths: string[]) {
    for (const path of paths) {
      const segments = path.split('.');
      let current: unknown = source;

      for (const segment of segments) {
        if (!current || typeof current !== 'object' || !(segment in (current as Record<string, unknown>))) {
          current = undefined;
          break;
        }

        current = (current as Record<string, unknown>)[segment];
      }

      if (current !== undefined && current !== null && String(current).trim() !== '') {
        return current;
      }
    }

    return undefined;
  }

  private asStructuredObject(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asStructuredArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    return value === undefined || value === null ? [] : [value];
  }

  private sanitizeImportedText(value: unknown): string {
    return String(value ?? '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
  }

  private makeUniqueImportHeaders(headers: string[]): string[] {
    const counts = new Map<string, number>();

    return headers.map((header, index) => {
      const base = header || `column_${index + 1}`;
      const normalized = this.normalizeHeader(base) || `column_${index + 1}`;
      const count = counts.get(normalized) ?? 0;
      counts.set(normalized, count + 1);

      return count === 0 ? base : `${base}_${count}`;
    });
  }

  private appendStructuredWaterReadings(
    row: ImportRow,
    entry: Record<string, unknown>,
    options: {
      targetPrefix: 'Kartsais' | 'Aukstais';
      serialNumberKey: 'Kartsais NR' | 'Aukstais NR';
      checkDueDateKey: 'Kartsais derig lidz' | 'Aukstais derig lidz';
      paths: string[];
    },
  ) {
    let meterGroup: Record<string, unknown> | undefined;

    for (const path of options.paths) {
      const candidate = this.getValueByPath(entry, [path]);
      meterGroup = this.asStructuredObject(candidate);
      if (meterGroup) break;
    }

    if (!meterGroup) {
      return;
    }

    const serialNumber = this.sanitizeImportedText(meterGroup.serialNumber);
    if (serialNumber) {
      row[options.serialNumberKey] = serialNumber;
    }

    const checkDueDate = this.sanitizeImportedText(meterGroup.checkDueDate);
    if (checkDueDate) {
      row[options.checkDueDateKey] = checkDueDate;
    }

    const history = this.asStructuredArray(meterGroup.history);
    for (const historyEntry of history) {
      const historyRecord = this.asStructuredObject(historyEntry);
      if (!historyRecord) continue;

      const month = Number(historyRecord.month);
      const year = Number(historyRecord.year);
      const readingValue = Number(
        historyRecord.currentValue ?? historyRecord.value ?? historyRecord.reading ?? historyRecord.meterValue,
      );

      if (!Number.isInteger(month) || month < 1 || month > 12) continue;
      if (!Number.isInteger(year) || year < 2000 || year > 3000) continue;
      if (!Number.isFinite(readingValue)) continue;

      const label = `${options.targetPrefix} ${String(month).padStart(2, '0')}/${year}`;
      row[label] = readingValue;
    }
  }

  private looksLikeImportEntry(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const entry = value as Record<string, unknown>;
    return Boolean(
      this.getValueByPath(entry, [
        'number',
        'apartmentNumber',
        'dz',
        'apartment.number',
        'address',
        'owner',
      ]),
    );
  }

  private extractImportEntries(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.extractImportEntries(item));
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    const record = value as Record<string, unknown>;

    for (const key of ['apartments', 'apartment', 'items', 'item', 'records', 'record', 'rows', 'row']) {
      if (key in record) {
        const nested = this.extractImportEntries(record[key]);
        if (nested.length > 0) {
          return nested;
        }
      }
    }

    if (this.looksLikeImportEntry(record)) {
      return [record];
    }

    for (const nestedValue of Object.values(record)) {
      const nested = this.extractImportEntries(nestedValue);
      if (nested.length > 0) {
        return nested;
      }
    }

    return [];
  }

  private normalizeStructuredImportRow(entry: Record<string, unknown>): ImportRow {
    const row: ImportRow = {};
    const assign = (target: string, paths: string[]) => {
      const value = this.getValueByPath(entry, paths);
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        row[target] = typeof value === 'string' ? this.sanitizeImportedText(value) : value;
      }
    };

    assign('Kadastra numurs', ['cadastralNumber', 'apartment.cadastralNumber']);
    assign('DZ', ['number', 'apartmentNumber', 'dz', 'apartment.number', 'apartmentNumberLabel']);
    assign('Adrese', ['address', 'apartment.address']);
    assign('Domājamā daļa', ['cadastralPart', 'apartment.cadastralPart']);
    assign('Daļa (kopīpašums)', ['commonPropertyShare', 'apartment.commonPropertyShare']);
    assign('Stavs', ['floor', 'apartment.floor']);
    assign('Īpašnieks', ['owner', 'ownerName', 'residentName']);
    assign('E pasts Reķiniem', ['ownerEmail', 'email', 'billingEmail']);
    assign('Dekl iedz', ['declaredResidents', 'registeredResidents']);
    assign('DZ t', ['apartmentType', 'type']);
    assign('Apkure', ['heatingArea']);
    assign('Apsaimn', ['managementArea', 'area']);
    assign('Kartsais NR', [
      'hotWaterMeterNumber',
      'meters.hotWater.number',
      'water.hot.number',
      'waterReadings.hotmeterwater.serialNumber',
    ]);
    assign('Aukstais NR', [
      'coldWaterMeterNumber',
      'meters.coldWater.number',
      'water.cold.number',
      'waterReadings.coldmeterwater.serialNumber',
    ]);
    assign('Kartsais derig lidz', [
      'hotWaterCheckDueDate',
      'meters.hotWater.checkDueDate',
      'water.hot.checkDueDate',
      'waterReadings.hotmeterwater.checkDueDate',
    ]);
    assign('Aukstais derig lidz', [
      'coldWaterCheckDueDate',
      'meters.coldWater.checkDueDate',
      'water.cold.checkDueDate',
      'waterReadings.coldmeterwater.checkDueDate',
    ]);

    this.appendStructuredWaterReadings(row, entry, {
      targetPrefix: 'Kartsais',
      serialNumberKey: 'Kartsais NR',
      checkDueDateKey: 'Kartsais derig lidz',
      paths: ['waterReadings.hotmeterwater', 'waterReadings.hotWater', 'meters.hotWater'],
    });
    this.appendStructuredWaterReadings(row, entry, {
      targetPrefix: 'Aukstais',
      serialNumberKey: 'Aukstais NR',
      checkDueDateKey: 'Aukstais derig lidz',
      paths: ['waterReadings.coldmeterwater', 'waterReadings.coldWater', 'meters.coldWater'],
    });

    return row;
  }

  private parseJsonImportRows(file: { buffer: Buffer }): ImportRow[] {
    let parsed: unknown;

    try {
      parsed = JSON.parse(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid JSON file');
    }

    const entries = this.extractImportEntries(parsed);
    if (entries.length === 0) {
      throw new BadRequestException('JSON file does not contain apartment records');
    }

    return entries.map((entry) => this.normalizeStructuredImportRow(entry));
  }

  private parseXmlImportRows(file: { buffer: Buffer }): ImportRow[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: true,
    });

    let parsed: unknown;

    try {
      parsed = parser.parse(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid XML file');
    }

    const entries = this.extractImportEntries(parsed);
    if (entries.length === 0) {
      throw new BadRequestException('XML file does not contain apartment records');
    }

    return entries.map((entry) => this.normalizeStructuredImportRow(entry));
  }

  private parseCsvImportRows(file: { buffer: Buffer }): ImportRow[] {
    const text = file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const commaCount = (firstLine.match(/,/g) ?? []).length;
    const semicolonCount = (firstLine.match(/;/g) ?? []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"') {
        if (quoted && next === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }

      if (!quoted && char === delimiter) {
        row.push(cell);
        cell = '';
        continue;
      }

      if (!quoted && (char === '\n' || char === '\r')) {
        if (char === '\r' && next === '\n') index += 1;
        row.push(cell);
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        cell = '';
        continue;
      }

      cell += char;
    }

    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
    if (rows.length < 2) {
      throw new BadRequestException('CSV file does not contain apartment records');
    }

    const headers = this.makeUniqueImportHeaders(rows[0].map((value) => this.sanitizeImportedText(value)));
    return rows.slice(1).map((values) => {
      const item: ImportRow = {};
      for (let index = 0; index < headers.length; index += 1) {
        const header = headers[index] || `column_${index + 1}`;
        item[header] = this.sanitizeImportedText(values[index] ?? '');
      }
      return item;
    });
  }

  private async parseXlsxImportRows(file: { buffer: Buffer }): Promise<ImportRow[]> {
    const workbook = new Workbook();

    try {
      const workbookBuffer = file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
      await workbook.xlsx.load(workbookBuffer);
    } catch {
      throw new BadRequestException('Invalid XLSX file');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('XLSX file does not contain any worksheets');
    }

    const rawHeaders: string[] = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const value = this.sanitizeImportedText(cell.text || cell.value);
      rawHeaders[columnNumber - 1] = value || `column_${columnNumber}`;
    });

    if (rawHeaders.length === 0 || !rawHeaders.some((header) => header.trim())) {
      throw new BadRequestException('XLSX file does not contain apartment records');
    }

    const headers = this.makeUniqueImportHeaders(rawHeaders);

    const rows: ImportRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (worksheetRow, rowNumber) => {
      if (rowNumber === 1) return;

      const item: ImportRow = {};
      let hasValue = false;
      for (let index = 0; index < headers.length; index += 1) {
        const cell = worksheetRow.getCell(index + 1);
        const value = this.sanitizeImportedText(cell.text || cell.value);
        item[headers[index] || `column_${index + 1}`] = value;
        hasValue = hasValue || value.length > 0;
      }

      if (hasValue) rows.push(item);
    });

    if (rows.length === 0) {
      throw new BadRequestException('XLSX file does not contain apartment records');
    }

    return rows;
  }

  private async parseImportRows(file: { buffer: Buffer; originalname?: string; mimetype?: string }): Promise<ImportRow[]> {
    const extension = this.getFileExtension(file);
    const mimeType = typeof file.mimetype === 'string' ? file.mimetype.toLowerCase() : '';
    const isXlsx =
      extension === '.xlsx' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (extension === '.json' || mimeType.includes('json')) {
      return this.parseJsonImportRows(file);
    }

    if (isXlsx) {
      return this.parseXlsxImportRows(file);
    }

    if (extension === '.xml' || mimeType === 'application/xml' || mimeType === 'text/xml') {
      return this.parseXmlImportRows(file);
    }

    if (extension === '.csv' || mimeType.includes('csv') || mimeType === 'text/plain') {
      return this.parseCsvImportRows(file);
    }

    throw new BadRequestException('Only CSV, JSON, XML, and XLSX files are supported');
  }

  async importFromFile(input: ImportInput) {
    const { request, user, file, buildingId, companyId } = input;
    this.assertAuthenticated(user);
    this.assertManagementCompanyMutation(user);
    const userRole = user.role;
    if (!userRole || !['ManagementCompany', 'Accountant'].includes(userRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!buildingId || !companyId) {
      throw new BadRequestException('Building ID and Company ID are required');
    }
    if (this.effectiveStaffCompanyId(user) !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'apartments:import', user.uid),
      5,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const importBuildingData = await this.getApprovedBuildingOrThrow(buildingId, companyId);

    const fileSize = file.size ?? file.buffer?.length ?? 0;
    if (!file.buffer || fileSize <= 0) {
      throw new BadRequestException('File is required');
    }

    if (fileSize > APARTMENT_IMPORT_MAX_BYTES) {
      throw new BadRequestException('Apartment import file is too large');
    }

    const rows = await this.parseImportRows(file);
    if (rows.length > APARTMENT_IMPORT_MAX_ROWS) {
      throw new BadRequestException(`Apartment import is limited to ${APARTMENT_IMPORT_MAX_ROWS} rows`);
    }

    const existingApartmentsSnapshot = await db
      .collection('apartments')
      .where('buildingId', '==', buildingId)
      .get();

    const existingApartmentNumbers = new Set(
      existingApartmentsSnapshot.docs
        .map((apartmentDoc) => apartmentDoc.data().number)
        .filter((number): number is string => typeof number === 'string' && number.trim() !== '')
        .map((n) => this.normalizeApartmentNumber(n)),
    );

    const importedApartmentNumbers = new Set<string>();
    const importedApartmentIds: string[] = [];
    const importedApartmentStorageFolders: { id: string }[] = [];
    const writeOperations: ApartmentWriteOperation[] = [];
    const codeContext = await this.getApartmentCodeContext(companyId, buildingId);
    const results = {
      imported: 0,
      errors: [] as string[],
      skippedDuplicates: [] as string[],
      createdApartments: [] as string[],
    };

    const basicFields = [
      'Kadastra numurs',
      'Adrese',
      'Domājamā daļa',
      'Daļa (kopīpašums)',
      'Īpašnieks',
      'E pasts Reķiniem',
      'DZ',
      'Stavs',
      'DZ t',
      'Apkure',
      'Apsaimn',
      'Dekl iedz',
      'Kartsais NR',
      'Aukstais NR',
    ];

    const uniqueNewApartmentNumbers = new Set<string>();
    for (const row of rows) {
      const apartmentNumber = this.getCellStringByHeader(row, [
        'DZ',
        'Dz',
        'Dz number',
        'Dz Number',
        'dz number',
        'Apartment number',
        'Apartment Number',
      ]);
      if (!apartmentNumber) continue;

      const normalizedApartmentNumber = this.normalizeApartmentNumber(apartmentNumber);
      if (existingApartmentNumbers.has(normalizedApartmentNumber)) continue;
      uniqueNewApartmentNumbers.add(normalizedApartmentNumber);
    }

    await this.assertBuildingApartmentCapacity({
      buildingId,
      building: importBuildingData,
      additionalApartments: uniqueNewApartmentNumbers.size,
    });

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const parseNum = (v: unknown): number | undefined => {
          const n = Number.parseFloat(String(v ?? '').replace(',', '.'));
          return Number.isFinite(n) ? n : undefined;
        };

        const buildFallbackReading = (params: {
          apartmentId: string;
          buildingId: string;
          meterId: string;
          previousValue: number;
          currentValue: number;
        }) => {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();
          const consumption = Math.max(0, params.currentValue - params.previousValue);
          return {
            id: randomUUID(),
            apartmentId: params.apartmentId,
            buildingId: params.buildingId,
            meterId: params.meterId,
            previousValue: params.previousValue,
            currentValue: params.currentValue,
            consumption,
            month,
            year,
            submittedAt: this.buildSubmittedAtFromPeriod(year, month),
          };
        };

        const apartmentNumber = this.getCellStringByHeader(row, [
          'DZ',
          'Dz',
          'Dz number',
          'Dz Number',
          'dz number',
          'Apartment number',
          'Apartment Number',
        ]);

        if (!apartmentNumber) continue;

        const normalizedApartmentNumber = this.normalizeApartmentNumber(apartmentNumber);
        if (existingApartmentNumbers.has(normalizedApartmentNumber) || importedApartmentNumbers.has(normalizedApartmentNumber)) {
          results.skippedDuplicates.push(`Квартира ${apartmentNumber} уже существует в выбранном доме`);
          continue;
        }

        const hotWaterMeterNumber = row['Kartsais NR'] !== undefined && row['Kartsais NR'] !== null
          ? String(row['Kartsais NR']).trim()
          : '';
        const coldWaterMeterNumber = row['Aukstais NR'] !== undefined && row['Aukstais NR'] !== null
          ? String(row['Aukstais NR']).trim()
          : '';

        const readableId = this.buildApartmentReadableId(codeContext, apartmentNumber);
        const apartmentRef = this.apartmentsRepository.createRef();
        const apartmentData: Record<string, unknown> = {
          buildingId,
          number: apartmentNumber,
          normalizedNumber: normalizedApartmentNumber,
          companyId,
          companyIds: [companyId],
          storageApartmentId: apartmentRef.id,
          readableId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        basicFields.forEach((field) => {
          if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
            if (field === 'Kadastra numurs') apartmentData.cadastralNumber = row[field].toString();
            else if (field === 'Adrese') apartmentData.address = row[field].toString();
            else if (field === 'Stavs') apartmentData.floor = row[field].toString();
            else if (field === 'E pasts Reķiniem') apartmentData.ownerEmail = row[field].toString();
            else if (field === 'Īpašnieks') apartmentData.owner = row[field].toString();
            else if (field === 'Domājamā daļa') apartmentData.cadastralPart = row[field].toString();
            else if (field === 'Daļa (kopīpašums)') apartmentData.commonPropertyShare = row[field].toString();
            else if (field === 'DZ t') apartmentData.apartmentType = row[field].toString();
            else if (field === 'Apkure') apartmentData.heatingArea = parseFloat(String(row[field]));
            else if (field === 'Apsaimn') apartmentData.managementArea = parseFloat(String(row[field]));
            else if (field === 'Dekl iedz') apartmentData.declaredResidents = parseInt(String(row[field]), 10);
          }
        });

        const waterReadings: Record<string, unknown> = {};
        const hotWaterCheckDueDate = this.findDueDateFromRow(row, 'hot');
        const coldWaterCheckDueDate = this.findDueDateFromRow(row, 'cold');

        const hotWaterReadings = this.extractReadings(row, 'Kartsais');
        const hotCurrent = parseNum(row['Kartsais_1']);
        const hotPrevious = parseNum(row['Kartsais']);

        if (hotWaterMeterNumber || hotWaterReadings.length > 0 || hotCurrent !== undefined) {
          const hotWaterMeterId = randomUUID();
          const hotGroup = this.buildWaterReadingGroup({
            apartmentId: apartmentRef.id,
            buildingId,
            meterId: hotWaterMeterId,
            serialNumber: hotWaterMeterNumber,
            checkDueDate: hotWaterCheckDueDate,
            readings: hotWaterReadings,
          });

          if (hotGroup.history.length === 0) {
            if (hotCurrent !== undefined) {
              hotGroup.history = [
                buildFallbackReading({
                  apartmentId: apartmentRef.id,
                  buildingId,
                  meterId: hotWaterMeterId,
                  previousValue: hotPrevious ?? 0,
                  currentValue: hotCurrent,
                }),
              ];
            }
          }

          waterReadings.hotmeterwater = hotGroup;
        }

        const coldWaterReadings = this.extractReadings(row, 'Aukstais');
        const coldCurrent = parseNum(row['Aukstais_1']);
        const coldPrevious = parseNum(row['Aukstais']);

        if (coldWaterMeterNumber || coldWaterReadings.length > 0 || coldCurrent !== undefined) {
          const coldWaterMeterId = randomUUID();
          const coldGroup = this.buildWaterReadingGroup({
            apartmentId: apartmentRef.id,
            buildingId,
            meterId: coldWaterMeterId,
            serialNumber: coldWaterMeterNumber,
            checkDueDate: coldWaterCheckDueDate,
            readings: coldWaterReadings,
          });

          if (coldGroup.history.length === 0) {
            if (coldCurrent !== undefined) {
              coldGroup.history = [
                buildFallbackReading({
                  apartmentId: apartmentRef.id,
                  buildingId,
                  meterId: coldWaterMeterId,
                  previousValue: coldPrevious ?? 0,
                  currentValue: coldCurrent,
                }),
              ];
            }
          }

          waterReadings.coldmeterwater = coldGroup;
        }

        writeOperations.push((batch) => {
          batch.set(apartmentRef, { ...apartmentData, waterReadings });
        });

        importedApartmentNumbers.add(normalizedApartmentNumber);
        importedApartmentIds.push(apartmentRef.id);
        importedApartmentStorageFolders.push({ id: apartmentRef.id });
        existingApartmentNumbers.add(normalizedApartmentNumber);

        results.imported += 1;
        results.createdApartments.push(
          `${apartmentNumber} (${apartmentData.address || 'N/A'}) - Собственник: ${apartmentData.owner || 'N/A'}`,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Row ${i + 1}: ${errorMsg}`);
      }
    }

    if (importedApartmentIds.length > 0) {
      await this.apartmentsRepository.commitInChunks(writeOperations);
      await db.collection('buildings').doc(buildingId).set(
        { apartmentIds: FieldValue.arrayUnion(...importedApartmentIds) },
        { merge: true },
      );

      await Promise.all(importedApartmentStorageFolders.map((apartment) =>
        this.markStorageFolders(db.collection('apartments').doc(apartment.id), [
          ...this.getBuildingStorageFolders(companyId, buildingId),
          ...this.getApartmentStorageFolders(companyId, buildingId, apartment.id),
        ], 'imported apartment'),
      ));
    }

    void this.auditLogService.write({
      request,
      action: 'apartments.import',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      metadata: {
        buildingId,
        imported: results.imported,
        skippedDuplicates: results.skippedDuplicates.length,
        rowErrors: results.errors.length,
      },
    });

    return { success: true, results };
  }

  private mapApartmentDoc(id: string, data: Record<string, unknown>) {
    const createdAtRaw = data.createdAt as { toDate?: () => Date } | Date | string | undefined;
    const createdAt =
      createdAtRaw instanceof Date
        ? createdAtRaw
        : typeof createdAtRaw === 'string'
          ? new Date(createdAtRaw)
          : typeof createdAtRaw?.toDate === 'function'
            ? createdAtRaw.toDate()
            : undefined;
    const ownerActivated = data.ownerActivated === true || data.ownerActivated === 'true';

    return {
      id,
      ...data,
      ownerActivated,
      createdAt,
    };
  }

  async list(request: Request, user: RequestUser, query: Record<string, unknown>) {
    this.assertAuthenticated(user);

    const companyId = typeof query.companyId === 'string' ? query.companyId.trim() : '';
    const buildingId = typeof query.buildingId === 'string' ? query.buildingId.trim() : '';
    const residentId = typeof query.residentId === 'string' ? query.residentId.trim() : '';
    if (residentId && !this.isStaff(user) && residentId !== user.uid) {
      throw new ForbiddenException('Access denied');
    }

    await this.enforceRateLimit(request, 'apartments:list', `${user.uid}:${companyId || buildingId || residentId || 'all'}`, 40);

    const db = this.firebaseAdminService.firestore;
    let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;

    if (residentId) {
      snapshot = await db.collection('apartments').where('residentId', '==', residentId).get();
    } else if (buildingId) {
      snapshot = await db.collection('apartments').where('buildingId', '==', buildingId).get();
    } else if (companyId) {
      if (!this.isStaff(user) || this.effectiveStaffCompanyId(user) !== companyId) {
        throw new ForbiddenException('Access denied for company');
      }

      const [byArray, byLegacy] = await Promise.all([
        db.collection('apartments').where('companyIds', 'array-contains', companyId).get(),
        db.collection('apartments').where('companyId', '==', companyId).get(),
      ]);

      const merged = new Map<string, Record<string, unknown>>();
      for (const doc of [...byArray.docs, ...byLegacy.docs]) {
        merged.set(doc.id, doc.data() as Record<string, unknown>);
      }

      const items = this.sortApartmentItems(
        Array.from(merged.entries()).map(([id, data]) => this.mapApartmentDoc(id, data)),
      );

      const withOwnerAccess = await this.withResolvedOwnerAccess(items);
      return { items: await this.withOwnerInvitationDates(withOwnerAccess) };
    } else {
      const userRole = user.role;
      if (!userRole || !['ManagementCompany', 'Accountant'].includes(userRole)) {
        throw new ForbiddenException('Insufficient permissions');
      }
      const scopedCompanyId = this.effectiveStaffCompanyId(user);
      const [byArray, byLegacy] = await Promise.all([
        db.collection('apartments').where('companyIds', 'array-contains', scopedCompanyId).get(),
        db.collection('apartments').where('companyId', '==', scopedCompanyId).get(),
      ]);

      const merged = new Map<string, Record<string, unknown>>();
      for (const doc of [...byArray.docs, ...byLegacy.docs]) {
        merged.set(doc.id, doc.data() as Record<string, unknown>);
      }

      const items = this.sortApartmentItems(
        Array.from(merged.entries()).map(([id, data]) => this.mapApartmentDoc(id, data)),
      );

      const withOwnerAccess = await this.withResolvedOwnerAccess(items);
      return { items: await this.withOwnerInvitationDates(withOwnerAccess) };
    }

    const rawItems = snapshot.docs.map((doc) => this.mapApartmentDoc(doc.id, doc.data() as Record<string, unknown>));
    let accessibleItems = rawItems;
    if (this.isStaff(user)) {
      accessibleItems = rawItems.filter((item) => this.apartmentBelongsToStaffCompany(user, item));
    } else if (isPropertyMemberRole(user.role)) {
      const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
      accessibleItems = rawItems.filter((item) => accessibleApartmentIds.includes(this.firstString(item.id)));
    } else {
      throw new ForbiddenException('Insufficient permissions');
    }

    const items = this.sortApartmentItems(accessibleItems);

    const withOwnerAccess = await this.withResolvedOwnerAccess(items);
    return { items: await this.withOwnerInvitationDates(withOwnerAccess) };
  }

  async byId(request: Request, user: RequestUser, apartmentId: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:by-id', `${user.uid}:${apartmentId}`, 60);

    const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const data = snap.data() as Record<string, unknown>;

    if (this.isStaff(user)) {
      this.assertApartmentCompanyAccess(user, data);
    } else if (isPropertyMemberRole(user.role)) {
      const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
      if (!accessibleApartmentIds.includes(snap.id)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else {
      throw new ForbiddenException('Insufficient permissions');
    }

    const [withOwnerAccess] = await this.withResolvedOwnerAccess([this.mapApartmentDoc(snap.id, data)]);
    const [item] = await this.withOwnerInvitationDates([withOwnerAccess]);
    return item;
  }

  async create(request: Request, user: RequestUser, payload: CreateApartmentDto) {
    this.assertAuthenticated(user);
    this.assertManagementCompanyMutation(user);
    const userRole = user.role;
    if (!userRole || !['ManagementCompany', 'Accountant'].includes(userRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const number = typeof payload.number === 'string' ? payload.number.trim() : '';
    const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId.trim() : '';
    const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';

    if (!number || !buildingId || !companyId) {
      throw new BadRequestException('number, buildingId and companyId are required');
    }
    if (this.effectiveStaffCompanyId(user) !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'apartments:create', `${user.uid}:${companyId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const normalizedNumber = this.normalizeApartmentNumber(number);
    const [duplicateByNormalizedNumber, duplicateByLegacyNumber] = await Promise.all([
      db.collection('apartments')
        .where('buildingId', '==', buildingId)
        .where('normalizedNumber', '==', normalizedNumber)
        .limit(1)
        .get(),
      db.collection('apartments')
        .where('buildingId', '==', buildingId)
        .where('number', '==', number)
        .limit(1)
        .get(),
    ]);
    if (!duplicateByNormalizedNumber.empty || !duplicateByLegacyNumber.empty) {
      throw new BadRequestException('Квартира с таким номером уже существует в этом доме');
    }

    const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
    const readableId = await this.generateApartmentReadableId(companyId, buildingId, number);
    const ref = this.apartmentsRepository.createRef();
    const building = await this.getApprovedBuildingOrThrow(buildingId, companyId);
    await this.assertBuildingApartmentCapacity({
      buildingId,
      building,
      additionalApartments: 1,
    });
    const waterReadings = this.buildEmptyWaterReadings(ref.id, buildingId, building, readingConfigOverride);
    const data = {
      number,
      normalizedNumber,
      buildingId,
      companyId,
      companyIds: [companyId],
      storageApartmentId: ref.id,
      readableId,
      ...(typeof payload.address === 'string' && payload.address.trim() ? { address: payload.address.trim() } : {}),
      ...(typeof payload.floor === 'number' ? { floor: payload.floor } : {}),
      ...(typeof payload.area === 'number' ? { area: payload.area } : {}),
      ...(typeof payload.declaredResidents === 'number' ? { declaredResidents: payload.declaredResidents } : {}),
      ...(readingConfigOverride ? { readingConfigOverride } : {}),
      ...(Object.keys(waterReadings).length > 0 ? { waterReadings } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await ref.set(data);

    await this.markStorageFolders(ref, [
      ...this.getBuildingStorageFolders(companyId, buildingId),
      ...this.getApartmentStorageFolders(companyId, buildingId, ref.id),
    ], 'apartment');

    await db.collection('buildings').doc(buildingId).set(
      { apartmentIds: FieldValue.arrayUnion(ref.id) },
      { merge: true },
    );

    return { id: ref.id, ...data };
  }

  async update(request: Request, user: RequestUser, apartmentId: string, payload: UpdateApartmentDto) {
    this.assertAuthenticated(user);
    this.assertManagementCompanyMutation(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:update', `${user.uid}:${apartmentId}`, 40);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('apartments').doc(apartmentId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const current = snap.data() as Record<string, unknown>;
    this.assertApartmentCompanyAccess(user, current);
    await this.assertApartmentBuildingEditableForStaff(user, current);

    const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
    const scopedCompanyId = this.effectiveStaffCompanyId(user);
    const currentCompanyId = this.apartmentInvitationService.resolveApartmentCompanyId(current);
    
    // Generate new readableId if number or companyId changes
    const updatedCompanyId = typeof payload.companyId === 'string'
      ? payload.companyId.trim()
      : scopedCompanyId;
    if (updatedCompanyId !== scopedCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }
    const updatedBuildingId = typeof payload.buildingId === 'string'
      ? payload.buildingId.trim()
      : (typeof current.buildingId === 'string' ? current.buildingId : undefined);
    const updatedNumber = typeof payload.number === 'string'
      ? payload.number
      : (typeof current.number === 'string' ? current.number : undefined);
    const shouldRegenerateReadableId = Boolean(
      (payload.companyId && updatedCompanyId !== currentCompanyId) ||
      (payload.buildingId && updatedBuildingId !== current.buildingId) ||
      (payload.number && updatedNumber !== current.number),
    );
    if (updatedCompanyId && updatedBuildingId) {
      const targetBuilding = await this.getApprovedBuildingOrThrow(updatedBuildingId, updatedCompanyId);
      if (updatedBuildingId !== current.buildingId) {
        await this.assertBuildingApartmentCapacity({
          buildingId: updatedBuildingId,
          building: targetBuilding,
          additionalApartments: 1,
          excludeApartmentId: apartmentId,
        });
      }
    }
    const normalizedNumber = typeof updatedNumber === 'string' ? this.normalizeApartmentNumber(updatedNumber) : undefined;
    if ((payload.number || payload.buildingId) && updatedBuildingId && normalizedNumber) {
      const duplicateByNormalizedNumber = await db
        .collection('apartments')
        .where('buildingId', '==', updatedBuildingId)
        .where('normalizedNumber', '==', normalizedNumber)
        .limit(2)
        .get();
      const hasDuplicate = duplicateByNormalizedNumber.docs.some((doc) => doc.id !== apartmentId);
      if (hasDuplicate) {
        throw new BadRequestException('РљРІР°СЂС‚РёСЂР° СЃ С‚Р°РєРёРј РЅРѕРјРµСЂРѕРј СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ РІ СЌС‚РѕРј РґРѕРјРµ');
      }
    }

    const readableId = shouldRegenerateReadableId && updatedCompanyId && updatedBuildingId && updatedNumber
      ? await this.generateApartmentReadableId(updatedCompanyId, updatedBuildingId, updatedNumber)
      : current.readableId;
    const sanitizedWaterReadings = this.apartmentMeterService.sanitizeWaterReadingPatch(payload.waterReadings);
    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (typeof payload.number === 'string') {
      updateData.number = payload.number.trim();
      updateData.normalizedNumber = this.normalizeApartmentNumber(payload.number);
    }
    if (typeof payload.buildingId === 'string') updateData.buildingId = payload.buildingId.trim();
    if (typeof payload.companyId === 'string') {
      updateData.companyId = updatedCompanyId;
      updateData.companyIds = [updatedCompanyId];
    }
    if (typeof payload.address === 'string') updateData.address = payload.address.trim();
    if (typeof payload.floor === 'number') updateData.floor = payload.floor;
    if (typeof payload.area === 'number') updateData.area = payload.area;
    if (typeof payload.declaredResidents === 'number') updateData.declaredResidents = payload.declaredResidents;
    if (typeof payload.cadastralNumber === 'string') updateData.cadastralNumber = payload.cadastralNumber.trim();
    if (typeof payload.cadastralPart === 'string') updateData.cadastralPart = payload.cadastralPart.trim();
    if (typeof payload.commonPropertyShare === 'string') updateData.commonPropertyShare = payload.commonPropertyShare.trim();
    if (typeof payload.apartmentType === 'string') updateData.apartmentType = payload.apartmentType.trim();
    if (typeof payload.heatingArea === 'number') updateData.heatingArea = payload.heatingArea;
    if (typeof payload.managementArea === 'number') updateData.managementArea = payload.managementArea;
    if (typeof readableId === 'string' && readableId.trim()) updateData.readableId = readableId;
    if (readingConfigOverride) updateData.readingConfigOverride = readingConfigOverride;
    if (sanitizedWaterReadings) {
      for (const [meterKey, meterPatch] of Object.entries(sanitizedWaterReadings)) {
        for (const [field, value] of Object.entries(meterPatch as Record<string, unknown>)) {
          updateData[`waterReadings.${meterKey}.${field}`] = value;
        }
      }
    }
    
    await ref.update(updateData);
    return { success: true };
  }

  async storageSummary(request: Request, user: RequestUser, apartmentId: string) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:storage-summary', `${user.uid}:${apartmentId}`, 60);

    const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const data = snap.data() as Record<string, unknown>;
    this.assertApartmentCompanyAccess(user, data);

    const context = this.resolveApartmentStorageContext(apartmentId, data);
    if (!context) {
      return { path: null, fileCount: 0, hasUserFiles: false };
    }

    return this.apartmentStorageService.getStorageFolderSummary(context.path);
  }

  async remove(request: Request, user: RequestUser, apartmentId: string) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    this.assertManagementCompanyMutation(user);
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:delete', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('apartments').doc(apartmentId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const data = snap.data() as Record<string, unknown>;
    this.assertApartmentCompanyAccess(user, data);
    await this.assertApartmentBuildingEditableForStaff(user, data);
    if (this.hasApartmentOccupant(data)) {
      throw new BadRequestException('Нельзя удалить квартиру: сначала отвяжите жильцов');
    }

    const context = this.resolveApartmentStorageContext(apartmentId, data);
    if (context) {
      await this.apartmentStorageService.deleteStorageFolder(context.path);
    }

    const buildingId = typeof data.buildingId === 'string' ? data.buildingId : undefined;
    await ref.delete();

    if (buildingId) {
      await db.collection('buildings').doc(buildingId).set(
        { apartmentIds: FieldValue.arrayRemove(apartmentId) },
        { merge: true },
      );
    }

    return { success: true };
  }

  async unassignResident(request: Request, user: RequestUser, apartmentId: string) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:unassign-resident', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.assertApartmentBuildingEditableForStaff(user, apartment);

    const userIdsToDetach = new Set<string>();
    const addUserId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        userIdsToDetach.add(value.trim());
      }
    };

    addUserId(apartment.residentId);
    addUserId(apartment.ownerId);

    if (Array.isArray(apartment.tenants)) {
      for (const tenant of apartment.tenants) {
        if (tenant && typeof tenant === 'object') {
          addUserId((tenant as Record<string, unknown>).userId);
        }
      }
    }

    await apartmentRef.set(
      {
        residentId: null,
        residentEmail: null,
        residentName: null,
        residentFirstName: null,
        residentLastName: null,
        ownerEmail: null,
        ownerId: null,
        owner: null,
        ownerFirstName: null,
        ownerLastName: null,
        ownerContractNumber: null,
        ownerInvitedAt: null,
        ownerAcceptedAt: null,
        ownerInvitationId: null,
        ownerActivated: null,
        tenants: [],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await Promise.all(
      Array.from(userIdsToDetach).map((targetUserId) =>
        db.collection('users').doc(targetUserId).set(
          {
            apartmentIds: FieldValue.arrayRemove(apartmentId),
            apartmentId: null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        ),
      ),
    );

    return { success: true };
  }

  async updateOwner(
    request: Request,
    user: RequestUser,
    apartmentId: string,
    ownerEmail: string,
    ownerData?: { firstName?: string; lastName?: string; contractNumber?: string },
  ) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');
    const email = ownerEmail?.trim().toLowerCase();
    if (!email) throw new BadRequestException('email is required');

    await this.enforceRateLimit(request, 'apartments:update-owner', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');
    const apartment = apartmentSnap.data() as Record<string, unknown>;

    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.assertApartmentBuildingEditableForStaff(user, apartment);

    const firstName = typeof ownerData?.firstName === 'string' ? ownerData.firstName.trim() : '';
    const lastName = typeof ownerData?.lastName === 'string' ? ownerData.lastName.trim() : '';
    const contractNumber = typeof ownerData?.contractNumber === 'string' ? ownerData.contractNumber.trim() : '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;

    let ownerId: string | undefined;
    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(email);
      ownerId = existing.uid;
    } catch {
      ownerId = undefined;
    }

    const previousOwnerId = typeof apartment.ownerId === 'string' ? apartment.ownerId.trim() : '';
    const { invitationLink, invitationId } = await this.apartmentInvitationService.createApartmentInvitation({
      apartmentId,
      apartment,
      email,
      user,
      request,
      inviteType: 'owner',
      role: 'Landlord',
      accountType: 'Landlord',
      firstName,
      lastName,
    });

    const ownerActivated = previousOwnerId === ownerId && apartment.ownerActivated === true;
    const ownerAcceptedAt = ownerActivated
      ? apartment.ownerAcceptedAt ?? new Date()
      : null;

    await apartmentRef.set(
      {
        ownerEmail: email,
        ownerId: ownerId ?? null,
        owner: fullName,
        ownerFirstName: firstName || null,
        ownerLastName: lastName || null,
        ownerContractNumber: contractNumber || null,
        ownerInvitedAt: new Date(),
        ownerInvitationId: invitationId,
        ownerActivated,
        ownerAcceptedAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    try {
      const profileUpdates: Promise<unknown>[] = [];
      if (previousOwnerId && previousOwnerId !== ownerId) {
        profileUpdates.push(
          db.collection('users').doc(previousOwnerId).set(
            {
              apartmentIds: FieldValue.arrayRemove(apartmentId),
              apartmentId: null,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          ),
        );
      }

      await Promise.all(profileUpdates);
    } catch (error) {
      this.logger.error('Failed to sync owner apartment profile', error instanceof Error ? error.stack : String(error));
    }

    const ownerInvitationContext = await this.apartmentInvitationService.resolveInvitationContext(apartment);

    await this.apartmentInvitationService.createOwnerInvitationNotification({
      ownerId,
      invitationLink,
      companyName: ownerInvitationContext.companyName,
      buildingName: ownerInvitationContext.buildingName,
      apartmentNumber: ownerInvitationContext.apartmentNumber,
    });

    // Send invitation email to owner
    try {
      await this.emailService.sendOwnerInvitation({
        to: email,
        ownerName: fullName,
        ownerEmail: email,
        companyName: ownerInvitationContext.companyName,
        buildingName: ownerInvitationContext.buildingName,
        apartmentNumber: ownerInvitationContext.apartmentNumber,
        invitationLink,
        language: 'lv',
      });
    } catch (error) {
      this.logger.error('Failed to send owner invitation email', error instanceof Error ? error.stack : String(error));
      // Don't throw - operation succeeded even if email fails
    }

    try {
      await this.apartmentInvitationService.emailPlatformAdminsAboutApartmentRequest({
        request,
        inviteType: 'owner',
        inviteeEmail: email,
        apartmentId,
        apartmentNumber: ownerInvitationContext.apartmentNumber,
        buildingName: ownerInvitationContext.buildingName,
        companyName: ownerInvitationContext.companyName,
      });
    } catch (error) {
      this.logger.error('Failed to send apartment request email to platform admins', error instanceof Error ? error.stack : String(error));
    }

    void this.auditLogService.write({
      action: 'updateOwner',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { ownerEmail: email },
    });

    return { success: true, ownerActivated };
  }

  async removeOwner(request: Request, user: RequestUser, apartmentId: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:remove-owner', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.assertApartmentBuildingEditableForStaff(user, apartment);

    const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId.trim() : '';
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.trim().toLowerCase() : '';
    if (!ownerId && !ownerEmail) {
      throw new NotFoundException('Owner not found in this apartment');
    }

    await apartmentRef.set(
      {
        ownerEmail: null,
        ownerId: null,
        owner: null,
        ownerFirstName: null,
        ownerLastName: null,
        ownerContractNumber: null,
        ownerInvitedAt: null,
        ownerAcceptedAt: null,
        ownerInvitationId: null,
        ownerActivated: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (ownerId) {
      await db.collection('users').doc(ownerId).set(
        {
          apartmentIds: FieldValue.arrayRemove(apartmentId),
          apartmentId: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      ).catch((error) => {
        this.logger.error(`Failed to detach apartment from owner ${ownerId}`, error instanceof Error ? error.stack : String(error));
      });
    }

    void this.auditLogService.write({
      action: 'removeOwner',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { ownerEmail },
    });

    return { success: true };
  }

  async addOrInviteTenant(
    request: Request,
    user: RequestUser,
    apartmentId: string,
    emailInput: string,
    tenantData?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      contractNumber?: string;
      fromDate?: string;
      until?: string;
      canViewDocuments?: boolean;
    },
  ) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');
    const email = emailInput?.trim().toLowerCase();
    if (!email) throw new BadRequestException('email is required');

    await this.enforceRateLimit(request, 'apartments:add-tenant', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');
    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);

    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Проверка что email не совпадает с email владельца
    if (typeof apartment.ownerEmail === 'string' && apartment.ownerEmail.trim()) {
      if (email.toLowerCase() === apartment.ownerEmail.toLowerCase()) {
        throw new BadRequestException('Email арендатора не может совпадать с email владельца квартиры');
      }
    }

    let authUserId = '';
    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(email);
      authUserId = existing.uid;
    } catch {
      authUserId = '';
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];

    const firstName = typeof tenantData?.firstName === 'string' ? tenantData.firstName.trim() : '';
    const lastName = typeof tenantData?.lastName === 'string' ? tenantData.lastName.trim() : '';
    const phone = typeof tenantData?.phone === 'string' ? tenantData.phone.trim() : '';
    const contractNumber = typeof tenantData?.contractNumber === 'string' ? tenantData.contractNumber.trim() : '';
    const fromDate = typeof tenantData?.fromDate === 'string' ? tenantData.fromDate.trim() : '';
    const until = typeof tenantData?.until === 'string' ? tenantData.until.trim() : '';
    const canViewDocuments = tenantData?.canViewDocuments === true;
    const permissions = ['submitMeter', ...(canViewDocuments ? ['viewDocuments'] : [])];
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;
    const tenantRecord: Record<string, unknown> = {
      email,
      name: fullName,
      permissions,
      apartmentId,
      status: 'Pending',
      invitedAt: new Date(),
    };

    if (authUserId) tenantRecord.userId = authUserId;
    if (firstName) tenantRecord.firstName = firstName;
    if (lastName) tenantRecord.lastName = lastName;
    if (phone) tenantRecord.phone = phone;
    if (contractNumber) tenantRecord.contractNumber = contractNumber;
    if (fromDate) tenantRecord.fromDate = fromDate;
    if (until) tenantRecord.until = until;

    if (authUserId) {
      await db.collection('users').doc(authUserId).set(
        {
          uid: authUserId,
          email,
          apartmentId,
          apartmentIds: FieldValue.arrayUnion(apartmentId),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    const nextTenants = [
      ...tenants.filter((tenant) => {
        const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
        const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
        const sameExistingUser = Boolean(authUserId && tenantUserId === authUserId);
        return !sameExistingUser && tenantEmail !== email;
      }),
      tenantRecord,
    ];

    await apartmentRef.set({ tenants: nextTenants, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // Create and send invitation email with token
    let invitationLink = '';
    let invitationId = '';
    const invitationContext = await this.apartmentInvitationService.resolveInvitationContext(apartment);

    try {
      const result = await this.apartmentInvitationService.createApartmentInvitation({
        apartmentId,
        apartment,
        email,
        user,
        request,
        inviteType: 'tenant',
        role: 'Resident',
        accountType: 'Resident',
        firstName,
        lastName,
      });
      invitationLink = result.invitationLink;
      invitationId = result.invitationId;

      await this.apartmentInvitationService.createTenantInvitationNotification({
        tenantId: authUserId,
        invitationLink,
        companyName: invitationContext.companyName,
        buildingName: invitationContext.buildingName,
        apartmentNumber: invitationContext.apartmentNumber,
      });

      await this.emailService.sendTenantInvitation({
        to: email,
        companyName: invitationContext.companyName,
        buildingName: invitationContext.buildingName,
        apartmentNumber: invitationContext.apartmentNumber,
        invitationLink,
        language: 'lv',
      });
    } catch (error) {
      this.logger.error('Failed to send tenant invitation email', error instanceof Error ? error.stack : String(error));
      // Don't throw - operation succeeded even if email fails
    }

    try {
      await this.apartmentInvitationService.emailPlatformAdminsAboutApartmentRequest({
        request,
        inviteType: 'tenant',
        inviteeEmail: email,
        apartmentId,
        apartmentNumber: invitationContext.apartmentNumber,
        buildingName: invitationContext.buildingName,
        companyName: invitationContext.companyName,
      });
    } catch (error) {
      this.logger.error('Failed to send apartment request email to platform admins', error instanceof Error ? error.stack : String(error));
    }

    return { success: true, invitationLink, invitationId };
  }

  async removeTenant(request: Request, user: RequestUser, apartmentId: string, userId: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim() || !userId?.trim()) {
      throw new BadRequestException('apartmentId and userId are required');
    }

    await this.enforceRateLimit(request, 'apartments:remove-tenant', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];

    const normalizedRemovedUser = userId.trim().toLowerCase();
    const removedTenant = tenants.find((tenant) => {
      const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
      const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
      return tenantUserId === userId || Boolean(tenantEmail && tenantEmail === normalizedRemovedUser);
    });

    if (!removedTenant) {
      throw new NotFoundException('Tenant not found in this apartment');
    }

    const removedTenantUserId = typeof removedTenant.userId === 'string' ? removedTenant.userId.trim() : '';
    const removedTenantEmail = typeof removedTenant.email === 'string' ? removedTenant.email.trim().toLowerCase() : '';
    const next = tenants.filter((tenant) => {
      const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
      const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
      return (
        tenantUserId !== userId &&
        (!removedTenantUserId || tenantUserId !== removedTenantUserId) &&
        (!tenantEmail || tenantEmail !== normalizedRemovedUser) &&
        (!removedTenantEmail || tenantEmail !== removedTenantEmail)
      );
    });

    // Prepare update data
    const updateData: Record<string, unknown> = {
      tenants: next,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // If no tenants left, clear residentId and other resident-related fields
    if (next.length === 0) {
      updateData.residentId = null;
    }

    // Check if the removed user is the owner and clear owner data.
    // The UI may send either ownerId or ownerEmail, depending on how the owner was loaded.
    const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : undefined;
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.trim().toLowerCase() : undefined;
    if ((ownerId && ownerId === userId) || (ownerEmail && ownerEmail === normalizedRemovedUser)) {
      updateData.ownerEmail = null;
      updateData.ownerId = null;
      updateData.owner = null;
      updateData.ownerFirstName = null;
      updateData.ownerLastName = null;
      updateData.ownerContractNumber = null;
      updateData.ownerInvitedAt = null;
      updateData.ownerAcceptedAt = null;
      updateData.ownerInvitationId = null;
      updateData.ownerActivated = null;
    }

    await apartmentRef.set(updateData, { merge: true });

    const userIdsToDetach = new Set<string>();
    if (removedTenantUserId) {
      userIdsToDetach.add(removedTenantUserId);
    } else if (!userId.includes('@')) {
      userIdsToDetach.add(userId.trim());
    }
    if (ownerId && ((ownerId === userId) || (ownerEmail && ownerEmail === normalizedRemovedUser))) {
      userIdsToDetach.add(ownerId);
    }

    await Promise.all(
      Array.from(userIdsToDetach).map((targetUserId) =>
        db.collection('users').doc(targetUserId).set(
          {
            apartmentIds: FieldValue.arrayRemove(apartmentId),
            apartmentId: null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        ).catch((error) => {
          this.logger.error(`Failed to detach apartment from user ${targetUserId}`, error instanceof Error ? error.stack : String(error));
        }),
      ),
    );

    return { success: true };
  }

  async updateTenant(
    request: Request,
    user: RequestUser,
    apartmentId: string,
    userId: string,
    tenantData: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      fromDate?: string;
      until?: string;
      status?: string;
      canViewDocuments?: boolean;
    },
  ) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim() || !userId?.trim()) {
      throw new BadRequestException('apartmentId and userId are required');
    }

    await this.enforceRateLimit(request, 'apartments:update-tenant', `${user.uid}:${apartmentId}`, 30);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];
    const normalizedTenantId = userId.trim().toLowerCase();
    let found = false;

    const nextTenants = tenants.map((tenant) => {
      const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
      const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
      const matches = tenantUserId === userId || Boolean(tenantEmail && tenantEmail === normalizedTenantId);
      if (!matches) return tenant;

      found = true;
      const firstName = typeof tenantData.firstName === 'string' ? tenantData.firstName.trim() : '';
      const lastName = typeof tenantData.lastName === 'string' ? tenantData.lastName.trim() : '';
      const phone = typeof tenantData.phone === 'string' ? tenantData.phone.trim() : '';
      const fromDate = typeof tenantData.fromDate === 'string' ? tenantData.fromDate.trim() : '';
      const until = typeof tenantData.until === 'string' ? tenantData.until.trim() : '';
      const status = typeof tenantData.status === 'string' ? tenantData.status.trim() : '';
      const currentPermissions = Array.isArray(tenant.permissions)
        ? tenant.permissions.filter((permission): permission is string => typeof permission === 'string')
        : ['submitMeter'];
      const nextPermissions = new Set(currentPermissions);
      nextPermissions.add('submitMeter');
      if (tenantData.canViewDocuments === true) {
        nextPermissions.add('viewDocuments');
      } else if (tenantData.canViewDocuments === false) {
        nextPermissions.delete('viewDocuments');
        nextPermissions.delete('documents');
      }
      const name = [firstName, lastName].filter(Boolean).join(' ') || this.firstString(tenant.name, tenant.email);
      const nextTenant: Record<string, unknown> = {
        ...tenant,
        name,
        permissions: Array.from(nextPermissions),
      };

      if (firstName) nextTenant.firstName = firstName;
      else delete nextTenant.firstName;
      if (lastName) nextTenant.lastName = lastName;
      else delete nextTenant.lastName;
      if (phone) nextTenant.phone = phone;
      else delete nextTenant.phone;
      if (fromDate) nextTenant.fromDate = fromDate;
      else delete nextTenant.fromDate;
      if (until) nextTenant.until = until;
      else delete nextTenant.until;
      if (status) {
        nextTenant.status = status;
        if (status.toLowerCase() === 'active') {
          nextTenant.acceptedAt = tenant.acceptedAt ?? new Date();
          nextTenant.activated = true;
        }
      }

      return nextTenant;
    });

    if (!found) {
      throw new NotFoundException('Tenant not found in this apartment');
    }

    await apartmentRef.set({ tenants: nextTenants, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { success: true };
  }

  async resendOwnerInvitation(request: Request, user: RequestUser, apartmentId: string, ownerEmail: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim() || !ownerEmail?.trim()) {
      throw new BadRequestException('apartmentId and ownerEmail are required');
    }

    await this.enforceRateLimit(request, 'apartments:resend-owner-invitation', `${user.uid}:${apartmentId}`, 30);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const currentOwnerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.toLowerCase() : '';
    if (currentOwnerEmail !== ownerEmail.toLowerCase()) {
      throw new NotFoundException('Owner not found in this apartment');
    }

    const { invitationLink, invitationId } = await this.apartmentInvitationService.createApartmentInvitation({
      apartmentId,
      apartment,
      email: ownerEmail.toLowerCase(),
      user,
      request,
      inviteType: 'owner',
      role: 'Landlord',
      accountType: 'Landlord',
    });

    let ownerId: string | undefined;
    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(ownerEmail.toLowerCase());
      ownerId = existing.uid;
    } catch {
      ownerId = undefined;
    }

    const ownerInvitationContext = await this.apartmentInvitationService.resolveInvitationContext(apartment);
    const ownerName = this.firstString(
      apartment.owner,
      apartment.ownerName,
      [this.firstString(apartment.ownerFirstName), this.firstString(apartment.ownerLastName)].filter(Boolean).join(' '),
    );

    await this.apartmentInvitationService.createOwnerInvitationNotification({
      ownerId,
      invitationLink,
      companyName: ownerInvitationContext.companyName,
      buildingName: ownerInvitationContext.buildingName,
      apartmentNumber: ownerInvitationContext.apartmentNumber,
    });

    // Send invitation email to owner
    try {
      await this.emailService.sendOwnerInvitation({
        to: ownerEmail,
        ownerName,
        ownerEmail,
        companyName: ownerInvitationContext.companyName,
        buildingName: ownerInvitationContext.buildingName,
        apartmentNumber: ownerInvitationContext.apartmentNumber,
        invitationLink,
        language: 'lv',
      });
    } catch (error) {
      this.logger.error('Failed to send owner invitation email', error instanceof Error ? error.stack : String(error));
      // Don't throw - operation succeeded even if email fails
    }

    try {
      await this.apartmentInvitationService.emailPlatformAdminsAboutApartmentRequest({
        request,
        inviteType: 'owner',
        inviteeEmail: ownerEmail.toLowerCase(),
        apartmentId,
        apartmentNumber: ownerInvitationContext.apartmentNumber,
        buildingName: ownerInvitationContext.buildingName,
        companyName: ownerInvitationContext.companyName,
      });
    } catch (error) {
      this.logger.error('Failed to send apartment request email to platform admins', error instanceof Error ? error.stack : String(error));
    }

    // Update invitedAt timestamp to track resend
    await apartmentRef.set(
      {
        ownerInvitedAt: new Date(),
        ownerInvitationId: invitationId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    void this.auditLogService.write({
      action: 'resendOwnerInvitation',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { ownerEmail },
    });

    return { success: true };
  }

  async resendTenantInvitation(request: Request, user: RequestUser, apartmentId: string, tenantEmail: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim() || !tenantEmail?.trim()) {
      throw new BadRequestException('apartmentId and tenantEmail are required');
    }

    await this.enforceRateLimit(request, 'apartments:resend-tenant-invitation', `${user.uid}:${apartmentId}`, 30);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];

    const tenant = tenants.find((t) => typeof t.email === 'string' && t.email.toLowerCase() === tenantEmail.toLowerCase());
    if (!tenant) {
      throw new NotFoundException('Tenant not found in this apartment');
    }

    const invitationContext = await this.apartmentInvitationService.resolveInvitationContext(apartment);

    // Create and send invitation email with token
    try {
      const { invitationLink } = await this.apartmentInvitationService.createApartmentInvitation({
        apartmentId,
        apartment,
        email: tenantEmail,
        user,
        request,
        inviteType: 'tenant',
        role: 'Resident',
        accountType: 'Resident',
        firstName: typeof tenant.firstName === 'string' ? tenant.firstName : undefined,
        lastName: typeof tenant.lastName === 'string' ? tenant.lastName : undefined,
      });

      await this.emailService.sendTenantInvitation({
        to: tenantEmail,
        companyName: invitationContext.companyName,
        buildingName: invitationContext.buildingName,
        apartmentNumber: invitationContext.apartmentNumber,
        invitationLink,
        language: 'lv',
      });
    } catch (error) {
      this.logger.error('Failed to send tenant invitation email', error instanceof Error ? error.stack : String(error));
      // Don't throw - operation succeeded even if email fails
    }

    try {
      await this.apartmentInvitationService.emailPlatformAdminsAboutApartmentRequest({
        request,
        inviteType: 'tenant',
        inviteeEmail: tenantEmail.toLowerCase(),
        apartmentId,
        apartmentNumber: invitationContext.apartmentNumber,
        buildingName: invitationContext.buildingName,
        companyName: invitationContext.companyName,
      });
    } catch (error) {
      this.logger.error('Failed to send apartment request email to platform admins', error instanceof Error ? error.stack : String(error));
    }

    // Update the invitedAt timestamp to track resend
    const updatedTenants = tenants.map((t) =>
      typeof t.email === 'string' && t.email.toLowerCase() === tenantEmail.toLowerCase()
        ? { ...t, invitedAt: new Date() }
        : t,
    );

    await apartmentRef.set({ tenants: updatedTenants, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    void this.auditLogService.write({
      action: 'resendTenantInvitation',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { tenantEmail },
    });

    return { success: true };
  }

  async getAuditLogs(request: Request, user: RequestUser, apartmentId: string, limit: number = 50) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');
    if (normalizeUserRole(user.role) !== 'ManagementCompany') {
      throw new ForbiddenException('Audit logs are only available for management company');
    }

    await this.enforceRateLimit(request, 'apartments:audit-logs', `${user.uid}:${apartmentId}`, 60);

    const db = this.firebaseAdminService.firestore;
    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    this.assertApartmentCompanyAccess(user, apartment);

    // Fetch logs filtered by apartmentId (no composite index needed)
    const logs = await db
      .collection('audit_logs')
      .where('apartmentId', '==', apartmentId)
      .get();

    // Sort in-memory to avoid composite index requirement
    const sortedDocs = logs.docs.sort((a, b) => {
      return this.timestampMillis(b.data().createdAt) - this.timestampMillis(a.data().createdAt);
    }).slice(0, limit);

    return {
      items: sortedDocs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt:
          doc.data().createdAt instanceof Date
            ? doc.data().createdAt.toISOString()
            : typeof doc.data().createdAt === 'string'
              ? doc.data().createdAt
              : typeof doc.data().createdAt?.toDate === 'function'
                ? doc.data().createdAt.toDate().toISOString()
                : new Date().toISOString(),
      })),
    };
  }

  /**
   * Migrate apartments by generating and updating readableId for all apartments without one
   * This method scans all apartments and adds readableId to those that don't have it
   */
  async migrateApartmentReadableIds(): Promise<{
    updated: number;
    total: number;
    skipped: number;
    errors: Array<{ apartmentId: string; message: string }>;
  }> {
    const db = this.firebaseAdminService.firestore;
    const snapshot = await db.collection('apartments').get();

    let updated = 0;
    let skipped = 0;
    const errors: Array<{ apartmentId: string; message: string }> = [];
    const writeOperations: ApartmentWriteOperation[] = [];
    const contextCache = new Map<string, ApartmentCodeContext>();

    for (const doc of snapshot.docs) {
      try {
        const apartment = doc.data() as Record<string, unknown>;

        if (apartment.readableId) {
          skipped += 1;
          continue;
        }

        const companyId = typeof apartment.companyId === 'string' 
          ? apartment.companyId 
          : (Array.isArray(apartment.companyIds) && apartment.companyIds.length > 0 
            ? apartment.companyIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? ''
            : '');
        
        const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
        if (!companyId || !buildingId) {
          skipped += 1;
          continue;
        }

        const number = typeof apartment.number === 'string' ? apartment.number : doc.id;
        const cacheKey = `${companyId}:${buildingId}`;
        let context = contextCache.get(cacheKey);
        if (!context) {
          context = await this.getApartmentCodeContext(companyId, buildingId);
          contextCache.set(cacheKey, context);
        }
        const readableId = this.buildApartmentReadableId(context, number);
        writeOperations.push((batch) => {
          batch.set(doc.ref, { readableId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
        updated++;
      } catch (error) {
        errors.push({
          apartmentId: doc.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.apartmentsRepository.commitInChunks(writeOperations);

    return { updated, total: snapshot.size, skipped, errors };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';
import { isPropertyMemberRole, isStaffRole } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { normalizeEmail } from '../../common/utils/invitation-token';
import { EmailService } from '../emails/email.service';

type ParsedReading = {
  label: string;
  value: number;
  month: number;
  year: number;
};

type ImportInput = {
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

type ImportRow = Record<string, unknown>;

@Injectable()
export class ApartmentsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
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

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) {
      throw new UnauthorizedException('Authentication required');
    }
  }

  private isStaff(user: RequestUser): boolean {
    return isStaffRole(user.role);
  }

  private async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    const apartmentIds = new Set<string>();

    const addApartmentId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        apartmentIds.add(value.trim());
      }
    };

    addApartmentId(user.apartmentId);

    const userSnap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      for (const apartmentId of userData.apartmentIds) {
        addApartmentId(apartmentId);
      }
    }

    const normalizedEmail = normalizeEmail(
      (typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '',
    );

    if (normalizedEmail) {
      const [residentSnap, ownerSnap] = await Promise.all([
        this.firebaseAdminService.firestore.collection('apartments').where('residentId', '==', user.uid).get(),
        this.firebaseAdminService.firestore.collection('apartments').where('ownerEmail', '==', normalizedEmail).get(),
      ]);

      for (const doc of [...residentSnap.docs, ...ownerSnap.docs]) {
        apartmentIds.add(doc.id);
      }
    }

    const tenantSnap = await this.firebaseAdminService.firestore.collection('apartments').get();
    for (const doc of tenantSnap.docs) {
      const apartment = doc.data() as Record<string, unknown>;
      const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
      const isTenant = tenants.some((tenant) => {
        if (!tenant || typeof tenant !== 'object') return false;
        return typeof (tenant as Record<string, unknown>).userId === 'string'
          && (tenant as Record<string, unknown>).userId === user.uid;
      });

      if (isTenant) {
        apartmentIds.add(doc.id);
      }
    }

    return Array.from(apartmentIds);
  }

  private canManageTenants(user: RequestUser, apartmentId: string, apartment: Record<string, unknown>): boolean {
    if (this.isStaff(user)) {
      const companyIds = Array.isArray(apartment.companyIds)
        ? apartment.companyIds.filter((x): x is string => typeof x === 'string')
        : [];
      const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : undefined;

      return !user.companyId || companyIds.includes(user.companyId) || companyId === user.companyId;
    }

    if (user.role !== 'Landlord') {
      return false;
    }

    const normalizedUserEmail = normalizeEmail(user.email ?? '');
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';

    return Boolean(normalizedUserEmail && ownerEmail && normalizedUserEmail === ownerEmail);
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

  private normalizeReadingConfigOverride(payload: Record<string, unknown>) {
    const raw = payload.readingConfigOverride;
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }

    const config = raw as Record<string, unknown>;
    const useBuildingDefaults = config.useBuildingDefaults !== false;
    const hotWaterMeters = Math.max(0, Math.trunc(Number(config.hotWaterMeters ?? 0) || 0));
    const coldWaterMeters = Math.max(0, Math.trunc(Number(config.coldWaterMeters ?? 0) || 0));

    return {
      useBuildingDefaults,
      hotWaterMeters: useBuildingDefaults ? 0 : hotWaterMeters,
      coldWaterMeters: useBuildingDefaults ? 0 : coldWaterMeters,
    };
  }

  /**
   * Generate a readable ID for apartment from apartment number and company ID
   * Format: APT<companyCode><apartmentNumber>
   * Example: APTABC42 or APTABCFX1 (if apartment number is mixed)
   */
  private generateApartmentReadableId(apartmentNumber?: string | number, companyId?: string): string {
    // Company code: take first 3 uppercase letters/digits from companyId, or use "UNK"
    const companyCode = companyId
      ? companyId.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X')
      : 'UNK';

    // Apartment number: normalize and take first 3 characters
    let aptNum = 'APT';
    if (apartmentNumber) {
      const normalized = String(apartmentNumber).toUpperCase().replace(/[^A-Z0-9]/g, '');
      aptNum = normalized.substring(0, 3) || 'APT';
    }

    return `APT${companyCode}${aptNum}`;
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
      if (raw < 20000 || raw > 70000) return null;
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + raw * 24 * 60 * 60 * 1000);
      if (!Number.isNaN(date.getTime())) {
        return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
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
      return n.startsWith('data') || n.includes('date');
    };
    const isLikelyDateColumn = (header: string): boolean => {
      const n = this.normalizeHeader(header);
      return isDateHeader(header) || n === '' || n.startsWith('__empty');
    };

    const findNearestPeriod = (index: number): { period: { month: number; year: number }; label: string } | null => {
      let best: { distance: number; period: { month: number; year: number }; label: string } | null = null;

      for (let j = 0; j < entries.length; j++) {
        if (j === index) continue;
        const [dateColName, dateValue] = entries[j];
        if (!isLikelyDateColumn(dateColName)) continue;

        const parsed = this.parsePeriodFromDateCell(dateValue);
        if (!parsed) continue;

        const distance = Math.abs(j - index);
        const candidateLabel = String(dateValue ?? dateColName).trim() || dateColName;

        if (!best || distance < best.distance || (distance === best.distance && j > index)) {
          best = { distance, period: parsed, label: candidateLabel };
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

  private parseSpreadsheetImportRows(file: { buffer: Buffer }): ImportRow[] {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;

      if (!sheetName || !sheet) {
        throw new Error('Spreadsheet file does not contain any worksheets');
      }

      return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as ImportRow[];
    } catch {
      throw new BadRequestException('Invalid spreadsheet file');
    }
  }

  private parseImportRows(file: { buffer: Buffer; originalname?: string; mimetype?: string }): ImportRow[] {
    const extension = this.getFileExtension(file);
    const mimeType = typeof file.mimetype === 'string' ? file.mimetype.toLowerCase() : '';

    if (extension === '.json' || mimeType.includes('json')) {
      return this.parseJsonImportRows(file);
    }

    if (extension === '.xml' || mimeType.includes('xml')) {
      try {
        return this.parseXmlImportRows(file);
      } catch (error) {
        if (
          error instanceof BadRequestException &&
          ['Invalid XML file', 'XML file does not contain apartment records'].includes(String(error.message))
        ) {
          return this.parseSpreadsheetImportRows(file);
        }

        throw error;
      }
    }

    return this.parseSpreadsheetImportRows(file);
  }

  async importFromFile(input: ImportInput) {
    const { request, user, file, buildingId, companyId } = input;
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!buildingId || !companyId) {
      throw new BadRequestException('Building ID and Company ID are required');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'apartments:import', user.uid),
      5,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const db = this.firebaseAdminService.firestore;
    const importBuildingSnap = await db.collection('buildings').doc(buildingId).get();
    if (!importBuildingSnap.exists) throw new NotFoundException('Building not found');
    const importBuildingData = importBuildingSnap.data() as Record<string, unknown>;
    const importBuildingCompanyId =
      (typeof importBuildingData.companyId === 'string' ? importBuildingData.companyId : undefined) ??
      ((importBuildingData.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);
    if (!importBuildingCompanyId || importBuildingCompanyId !== companyId) {
      throw new ForbiddenException('Access denied for building/company ownership');
    }

    const rows = this.parseImportRows(file);

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
    const results = {
      imported: 0,
      errors: [] as string[],
      skippedDuplicates: [] as string[],
      createdApartments: [] as string[],
    };

    // Single WriteBatch for all apartment writes (committed after the loop).
    const batch = db.batch();

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

        const apartmentData: Record<string, unknown> = {
          buildingId,
          number: apartmentNumber,
          companyIds: [companyId],
          readableId: this.generateApartmentReadableId(apartmentNumber, companyId),
          createdAt: new Date(),
          updatedAt: new Date(),
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

        const apartmentRef = db.collection('apartments').doc();
        const waterReadings: Record<string, unknown> = {};
        const hotWaterCheckDueDate = this.findDueDateFromRow(row, 'hot');
        const coldWaterCheckDueDate = this.findDueDateFromRow(row, 'cold');

        if (hotWaterMeterNumber) {
          const hotWaterMeterId = randomUUID();
          const hotWaterReadings = this.extractReadings(row, 'Kartsais');
          const hotGroup = this.buildWaterReadingGroup({
            apartmentId: apartmentRef.id,
            buildingId,
            meterId: hotWaterMeterId,
            serialNumber: hotWaterMeterNumber,
            checkDueDate: hotWaterCheckDueDate,
            readings: hotWaterReadings,
          });

          if (hotGroup.history.length === 0) {
            const hotCurrent = parseNum(row['Kartsais_1']);
            const hotPrevious = parseNum(row['Kartsais']);
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

        if (coldWaterMeterNumber) {
          const coldWaterMeterId = randomUUID();
          const coldWaterReadings = this.extractReadings(row, 'Aukstais');
          const coldGroup = this.buildWaterReadingGroup({
            apartmentId: apartmentRef.id,
            buildingId,
            meterId: coldWaterMeterId,
            serialNumber: coldWaterMeterNumber,
            checkDueDate: coldWaterCheckDueDate,
            readings: coldWaterReadings,
          });

          if (coldGroup.history.length === 0) {
            const coldCurrent = parseNum(row['Aukstais_1']);
            const coldPrevious = parseNum(row['Aukstais']);
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

        batch.set(apartmentRef, { ...apartmentData, waterReadings });

        importedApartmentNumbers.add(normalizedApartmentNumber);
        importedApartmentIds.push(apartmentRef.id);
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
      // Commit apartment writes (the single batch is fine for up to 500 rows).
      // FieldValue.arrayUnion accepts variadic args; update building once after the loop.
      await batch.commit();
      await db.collection('buildings').doc(buildingId).set(
        { apartmentIds: FieldValue.arrayUnion(...importedApartmentIds) },
        { merge: true },
      );
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

    return {
      id,
      ...data,
      createdAt,
    };
  }

  async list(request: Request, user: RequestUser, query: Record<string, unknown>) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');

    const companyId = typeof query.companyId === 'string' ? query.companyId.trim() : '';
    const buildingId = typeof query.buildingId === 'string' ? query.buildingId.trim() : '';
    const residentId = typeof query.residentId === 'string' ? query.residentId.trim() : '';

    await this.enforceRateLimit(request, 'apartments:list', `${user.uid}:${companyId || buildingId || residentId || 'all'}`, 40);

    const db = this.firebaseAdminService.firestore;
    let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;

    if (residentId) {
      snapshot = await db.collection('apartments').where('residentId', '==', residentId).get();
    } else if (buildingId) {
      snapshot = await db.collection('apartments').where('buildingId', '==', buildingId).get();
    } else if (companyId) {
      if (user.companyId && user.companyId !== companyId) {
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

      return { items: Array.from(merged.entries()).map(([id, data]) => this.mapApartmentDoc(id, data)) };
    } else {
      if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
      snapshot = await db.collection('apartments').limit(200).get();
    }

    return {
      items: snapshot.docs.map((doc) => this.mapApartmentDoc(doc.id, doc.data() as Record<string, unknown>)),
    };
  }

  async byId(request: Request, user: RequestUser, apartmentId: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:by-id', `${user.uid}:${apartmentId}`, 60);

    const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const data = snap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(data.companyIds)
      ? data.companyIds.filter((x): x is string => typeof x === 'string')
      : [];
    const companyId = typeof data.companyId === 'string' ? data.companyId : undefined;

    if (this.isStaff(user)) {
      if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
        throw new ForbiddenException('Access denied for company');
      }
    } else if (isPropertyMemberRole(user.role)) {
      const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
      if (!accessibleApartmentIds.includes(snap.id)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else {
      throw new ForbiddenException('Insufficient permissions');
    }

    return this.mapApartmentDoc(snap.id, data);
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const number = typeof payload.number === 'string' ? payload.number.trim() : '';
    const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId.trim() : '';
    const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';

    if (!number || !buildingId || !companyId) {
      throw new BadRequestException('number, buildingId and companyId are required');
    }
    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'apartments:create', `${user.uid}:${companyId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const duplicate = await db
      .collection('apartments')
      .where('buildingId', '==', buildingId)
      .where('number', '==', number)
      .limit(1)
      .get();
    if (!duplicate.empty) {
      throw new BadRequestException('Квартира с таким номером уже существует в этом доме');
    }

    const ref = db.collection('apartments').doc();
    const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
    const readableId = this.generateApartmentReadableId(number, companyId);
    const data = {
      ...payload,
      number,
      buildingId,
      companyIds: [companyId],
      readableId,
      ...(readingConfigOverride ? { readingConfigOverride } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await ref.set(data);
    await db.collection('buildings').doc(buildingId).set(
      { apartmentIds: FieldValue.arrayUnion(ref.id) },
      { merge: true },
    );

    return { id: ref.id, ...data };
  }

  async update(request: Request, user: RequestUser, apartmentId: string, payload: Record<string, unknown>) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:update', `${user.uid}:${apartmentId}`, 40);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('apartments').doc(apartmentId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const current = snap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(current.companyIds)
      ? current.companyIds.filter((x): x is string => typeof x === 'string')
      : [];
    const companyId = typeof current.companyId === 'string' ? current.companyId : undefined;
    if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
    
    // Generate new readableId if number or companyId changes
    const updatedNumber = typeof payload.number === 'string' ? payload.number : (typeof current.number === 'string' ? current.number : undefined);
    const updatedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : companyId;
    const readableId = this.generateApartmentReadableId(updatedNumber, updatedCompanyId);
    
    await ref.set(
      {
        ...payload,
        readableId,
        ...(readingConfigOverride ? { readingConfigOverride } : {}),
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return { success: true };
  }

  async remove(request: Request, user: RequestUser, apartmentId: string) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
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
    if (data.residentId) {
      throw new BadRequestException('Нельзя удалить квартиру: сначала отвяжите жильца');
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

    await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).set(
      {
        residentId: null,
        tenants: [],
        updatedAt: new Date(),
      },
      { merge: true },
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

    const firstName = typeof ownerData?.firstName === 'string' ? ownerData.firstName.trim() : '';
    const lastName = typeof ownerData?.lastName === 'string' ? ownerData.lastName.trim() : '';
    const contractNumber = typeof ownerData?.contractNumber === 'string' ? ownerData.contractNumber.trim() : '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;

    let ownerId = '';
    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(email);
      ownerId = existing.uid;
    } catch {
      const created = await this.firebaseAdminService.auth.createUser({
        email,
        password: Math.random().toString(36).slice(-12),
      });
      ownerId = created.uid;
      await db.collection('users').doc(ownerId).set(
        {
          uid: ownerId,
          email,
          role: 'Landlord',
          accountType: 'Landlord',
          companyId: typeof apartment.companyId === 'string' ? apartment.companyId : undefined,
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    await apartmentRef.set(
      {
        ownerEmail: email,
        ownerId: ownerId,
        owner: fullName,
        ownerFirstName: firstName || undefined,
        ownerLastName: lastName || undefined,
        ownerContractNumber: contractNumber || undefined,
        ownerInvitedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    // Send invitation email to owner
    try {
      const companyName = typeof apartment.managementCompanyName === 'string' 
        ? apartment.managementCompanyName 
        : typeof apartment.companyName === 'string' 
        ? apartment.companyName 
        : 'Property Management';
      
      const senderName = typeof user.email === 'string' ? user.email : 'Manager';
      
      await this.emailService.sendOwnerInvitation({
        to: email,
        companyName,
        invitationLink: `${process.env.FRONTEND_URL || 'https://domera.app'}/login`,
        senderName,
        language: 'lv',
      });
    } catch (error) {
      console.error('Failed to send owner invitation email:', error);
      // Don't throw - operation succeeded even if email fails
    }

    this.auditLogService.write({
      action: 'updateOwner',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { ownerEmail: email },
    });

    return { success: true };
  }

  async addOrInviteTenant(
    request: Request,
    user: RequestUser,
    apartmentId: string,
    emailInput: string,
    tenantData?: { firstName?: string; lastName?: string; phone?: string; contractNumber?: string },
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
      const created = await this.firebaseAdminService.auth.createUser({
        email,
        password: Math.random().toString(36).slice(-12),
      });
      authUserId = created.uid;
      await db.collection('users').doc(authUserId).set(
        {
          uid: authUserId,
          email,
          role: 'Resident',
          accountType: 'Resident',
          companyId:
            (Array.isArray(apartment.companyIds)
              ? apartment.companyIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0)
              : undefined) ??
            (typeof apartment.companyId === 'string' ? apartment.companyId : undefined),
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];

    if (tenants.some((t) => t.userId === authUserId)) {
      throw new BadRequestException('Этот пользователь уже имеет доступ');
    }

    // Проверка что email не совпадает ни с одним арендатором
    if (tenants.some((t) => typeof t.email === 'string' && email.toLowerCase() === t.email.toLowerCase())) {
      throw new BadRequestException('Этот email уже приглашен в качестве арендатора');
    }

    const firstName = typeof tenantData?.firstName === 'string' ? tenantData.firstName.trim() : '';
    const lastName = typeof tenantData?.lastName === 'string' ? tenantData.lastName.trim() : '';
    const phone = typeof tenantData?.phone === 'string' ? tenantData.phone.trim() : '';
    const contractNumber = typeof tenantData?.contractNumber === 'string' ? tenantData.contractNumber.trim() : '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;

    const nextTenants = [
      ...tenants,
      {
        userId: authUserId,
        email,
        name: fullName,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone || undefined,
        contractNumber: contractNumber || undefined,
        permissions: ['submitMeter'],
        apartmentId,
        status: 'Active',
        invitedAt: new Date(),
      },
    ];

    await apartmentRef.set({ tenants: nextTenants, updatedAt: new Date() }, { merge: true });

    // Send invitation email to tenant
    try {
      const companyName = typeof apartment.managementCompanyName === 'string' 
        ? apartment.managementCompanyName 
        : typeof apartment.companyName === 'string' 
        ? apartment.companyName 
        : 'Property Management';
      
      const buildingName = typeof apartment.building === 'string' 
        ? apartment.building 
        : typeof apartment.buildingName === 'string'
        ? apartment.buildingName
        : 'Building';
      
      const apartmentNumber = typeof apartment.number === 'string' 
        ? apartment.number 
        : typeof apartment.apartmentNumber === 'string'
        ? apartment.apartmentNumber
        : 'Apartment';
      
      const senderName = typeof user.email === 'string' ? user.email : 'Manager';

      await this.emailService.sendTenantInvitation({
        to: email,
        companyName,
        buildingName,
        apartmentNumber,
        invitationLink: `${process.env.FRONTEND_URL || 'https://domera.app'}/login`,
        senderName,
        language: 'lv',
      });
    } catch (error) {
      console.error('Failed to send tenant invitation email:', error);
      // Don't throw - operation succeeded even if email fails
    }

    return { success: true };
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
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];

    const next = tenants.filter((t) => t.userId !== userId);

    // Prepare update data
    const updateData: Record<string, unknown> = {
      tenants: next,
      updatedAt: new Date(),
    };

    // If no tenants left, clear residentId and other resident-related fields
    if (next.length === 0) {
      updateData.residentId = null;
    }

    // Check if the removed user is the owner and clear owner data
    const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : undefined;
    if (ownerId && ownerId === userId) {
      updateData.ownerEmail = null;
      updateData.ownerId = null;
      updateData.owner = null;
      updateData.ownerFirstName = null;
      updateData.ownerLastName = null;
      updateData.ownerContractNumber = null;
      updateData.ownerInvitedAt = null;
      updateData.ownerActivated = null;
    }

    await apartmentRef.set(updateData, { merge: true });
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
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const currentOwnerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.toLowerCase() : '';
    if (currentOwnerEmail !== ownerEmail.toLowerCase()) {
      throw new NotFoundException('Owner not found in this apartment');
    }

    // Send invitation email to owner
    try {
      const companyName = typeof apartment.managementCompanyName === 'string'
        ? apartment.managementCompanyName
        : typeof apartment.companyName === 'string'
          ? apartment.companyName
          : 'Property Management';

      const senderName = typeof user.email === 'string' ? user.email : 'Manager';

      await this.emailService.sendOwnerInvitation({
        to: ownerEmail,
        companyName,
        invitationLink: `${process.env.FRONTEND_URL || 'https://domera.app'}/login`,
        senderName,
        language: 'lv',
      });
    } catch (error) {
      console.error('Failed to send owner invitation email:', error);
      // Don't throw - operation succeeded even if email fails
    }

    // Update invitedAt timestamp to track resend
    await apartmentRef.set(
      {
        ownerInvitedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    this.auditLogService.write({
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

    // Send invitation email to tenant
    try {
      const companyName = typeof apartment.managementCompanyName === 'string'
        ? apartment.managementCompanyName
        : typeof apartment.companyName === 'string'
          ? apartment.companyName
          : 'Property Management';

      const buildingName = typeof apartment.buildingName === 'string' ? apartment.buildingName : 'Building';
      const apartmentNumber = typeof apartment.number === 'string' ? apartment.number : typeof apartment.apartmentNumber === 'string' ? apartment.apartmentNumber : 'Apartment';
      const senderName = typeof user.email === 'string' ? user.email : 'Manager';

      await this.emailService.sendTenantInvitation({
        to: tenantEmail,
        companyName,
        buildingName,
        apartmentNumber,
        invitationLink: `${process.env.FRONTEND_URL || 'https://domera.app'}/login`,
        senderName,
        language: 'lv',
      });
    } catch (error) {
      console.error('Failed to send tenant invitation email:', error);
      // Don't throw - operation succeeded even if email fails
    }

    // Update the invitedAt timestamp to track resend
    const updatedTenants = tenants.map((t) =>
      typeof t.email === 'string' && t.email.toLowerCase() === tenantEmail.toLowerCase()
        ? { ...t, invitedAt: new Date() }
        : t,
    );

    await apartmentRef.set({ tenants: updatedTenants, updatedAt: new Date() }, { merge: true });

    this.auditLogService.write({
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
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Audit logs are only available for management company');
    }

    await this.enforceRateLimit(request, 'apartments:audit-logs', `${user.uid}:${apartmentId}`, 60);

    const db = this.firebaseAdminService.firestore;
    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(apartment.companyIds)
      ? apartment.companyIds.filter((x): x is string => typeof x === 'string')
      : [];
    const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : undefined;

    if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    // Fetch logs filtered by apartmentId (no composite index needed)
    const logs = await db
      .collection('audit_logs')
      .where('apartmentId', '==', apartmentId)
      .get();

    // Sort in-memory to avoid composite index requirement
    const sortedDocs = logs.docs.sort((a, b) => {
      const aTime = a.data().createdAt instanceof Date ? a.data().createdAt.getTime() : 0;
      const bTime = b.data().createdAt instanceof Date ? b.data().createdAt.getTime() : 0;
      return bTime - aTime; // descending
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
              : new Date().toISOString(),
      })),
    };
  }

  /**
   * Migrate apartments by generating and updating readableId for all apartments without one
   * This method scans all apartments and adds readableId to those that don't have it
   */
  async migrateApartmentReadableIds(): Promise<{ updated: number; total: number }> {
    const db = this.firebaseAdminService.firestore;
    const snapshot = await db.collection('apartments').get();
    
    let updated = 0;
    const batch = db.batch();
    
    for (const doc of snapshot.docs) {
      const apartment = doc.data() as Record<string, unknown>;
      
      // Only update if readableId is missing
      if (!apartment.readableId) {
        const number = typeof apartment.number === 'string' ? apartment.number : '';
        const companyId = typeof apartment.companyId === 'string' 
          ? apartment.companyId 
          : (Array.isArray(apartment.companyIds) && apartment.companyIds.length > 0 
            ? apartment.companyIds[0] 
            : '');
        
        const readableId = this.generateApartmentReadableId(number, companyId);
        batch.set(doc.ref, { readableId, updatedAt: new Date() }, { merge: true });
        updated++;
      }
    }
    
    if (updated > 0) {
      await batch.commit();
    }
    
    return { updated, total: snapshot.size };
  }
}

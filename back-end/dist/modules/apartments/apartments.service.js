"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ApartmentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApartmentsService = void 0;
const common_1 = require("@nestjs/common");
const exceljs_1 = require("exceljs");
const fast_xml_parser_1 = require("fast-xml-parser");
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const role_constants_1 = require("../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const email_service_1 = require("../emails/services/email.service");
const apartments_repository_1 = require("./repositories/apartments.repository");
const apartment_access_service_1 = require("./services/apartment-access.service");
const apartment_code_service_1 = require("./services/apartment-code.service");
const apartment_invitation_service_1 = require("./services/apartment-invitation.service");
const apartment_meter_service_1 = require("./services/apartment-meter.service");
const apartment_storage_service_1 = require("./services/apartment-storage.service");
const APARTMENT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const APARTMENT_IMPORT_MAX_ROWS = 5_000;
let ApartmentsService = ApartmentsService_1 = class ApartmentsService {
    constructor(firebaseAdminService, rateLimitService, auditLogService, emailService, apartmentsRepository, apartmentAccessService, apartmentCodeService, apartmentInvitationService, apartmentMeterService, apartmentStorageService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.emailService = emailService;
        this.apartmentsRepository = apartmentsRepository;
        this.apartmentAccessService = apartmentAccessService;
        this.apartmentCodeService = apartmentCodeService;
        this.apartmentInvitationService = apartmentInvitationService;
        this.apartmentMeterService = apartmentMeterService;
        this.apartmentStorageService = apartmentStorageService;
        this.logger = new common_1.Logger(ApartmentsService_1.name);
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed) {
            throw new common_1.BadRequestException('Too many requests');
        }
    }
    firstString(...values) {
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
    compareApartmentOrder(left, right) {
        const leftLabel = this.firstString(left.number, left.apartmentNumber, left.id, left.apartmentId);
        const rightLabel = this.firstString(right.number, right.apartmentNumber, right.id, right.apartmentId);
        const leftNumber = Number(leftLabel);
        const rightNumber = Number(rightLabel);
        const bothNumeric = leftLabel !== '' &&
            rightLabel !== '' &&
            Number.isFinite(leftNumber) &&
            Number.isFinite(rightNumber);
        if (bothNumeric && leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }
        return leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: 'base' });
    }
    sortApartmentItems(items) {
        return [...items].sort((left, right) => this.compareApartmentOrder(left, right));
    }
    timestampMillis(value) {
        if (!value)
            return 0;
        if (value instanceof Date)
            return value.getTime();
        if (typeof value === 'string') {
            const parsed = new Date(value).getTime();
            return Number.isFinite(parsed) ? parsed : 0;
        }
        if (typeof value === 'object') {
            const record = value;
            const seconds = typeof record.seconds === 'number'
                ? record.seconds
                : typeof record._seconds === 'number'
                    ? record._seconds
                    : undefined;
            if (typeof seconds === 'number')
                return seconds * 1000;
            const toDate = record.toDate;
            if (typeof toDate === 'function') {
                try {
                    const date = toDate.call(value);
                    return date instanceof Date ? date.getTime() : 0;
                }
                catch {
                    return 0;
                }
            }
        }
        return 0;
    }
    async withOwnerInvitationDates(items) {
        const missingOwnerInvitationDates = items.filter((item) => {
            const apartmentId = this.firstString(item.id, item.apartmentId);
            const ownerEmail = this.firstString(item.ownerEmail);
            return apartmentId && ownerEmail && !item.ownerInvitedAt;
        });
        if (missingOwnerInvitationDates.length === 0)
            return items;
        const latestByApartment = new Map();
        const apartmentIds = Array.from(new Set(missingOwnerInvitationDates.map((item) => this.firstString(item.id, item.apartmentId)).filter(Boolean)));
        const ownerEmailByApartment = new Map(missingOwnerInvitationDates.map((item) => [
            this.firstString(item.id, item.apartmentId),
            this.firstString(item.ownerEmail).toLowerCase(),
        ]));
        for (let index = 0; index < apartmentIds.length; index += 30) {
            const chunk = apartmentIds.slice(index, index + 30);
            if (chunk.length === 0)
                continue;
            const invitations = await this.firebaseAdminService.firestore
                .collection('invitations')
                .where('apartmentId', 'in', chunk)
                .get();
            for (const invitationDoc of invitations.docs) {
                const invitation = invitationDoc.data();
                const apartmentId = this.firstString(invitation.apartmentId);
                const ownerEmail = ownerEmailByApartment.get(apartmentId);
                if (!apartmentId || !ownerEmail)
                    continue;
                const invitationEmail = this.firstString(invitation.email).toLowerCase();
                const inviteType = this.firstString(invitation.inviteType).toLowerCase();
                const role = this.firstString(invitation.role).toLowerCase();
                const isOwnerInvitation = inviteType === 'owner' || role === 'landlord';
                if (!isOwnerInvitation || invitationEmail !== ownerEmail)
                    continue;
                const date = invitation.createdAt ?? invitation.invitedAt;
                const millis = this.timestampMillis(date);
                if (!millis)
                    continue;
                const current = latestByApartment.get(apartmentId);
                if (!current || millis > current.millis) {
                    latestByApartment.set(apartmentId, { date, invitationId: invitationDoc.id, millis });
                }
            }
        }
        if (latestByApartment.size === 0)
            return items;
        return items.map((item) => {
            if (item.ownerInvitedAt)
                return item;
            const apartmentId = this.firstString(item.id, item.apartmentId);
            const invitation = latestByApartment.get(apartmentId);
            if (!invitation)
                return item;
            return {
                ...item,
                ownerInvitedAt: invitation.date,
                ownerInvitationId: item.ownerInvitationId ?? invitation.invitationId,
            };
        });
    }
    async withResolvedOwnerAccess(items) {
        const missingOwnerLinks = items.filter((item) => {
            const apartmentId = this.firstString(item.id, item.apartmentId);
            const ownerEmail = this.firstString(item.ownerEmail).toLowerCase();
            const ownerId = this.firstString(item.ownerId);
            return apartmentId && ownerEmail && !ownerId;
        });
        if (missingOwnerLinks.length === 0)
            return items;
        const emails = Array.from(new Set(missingOwnerLinks.map((item) => this.firstString(item.ownerEmail).toLowerCase()).filter(Boolean)));
        const userIdByEmail = new Map();
        for (let index = 0; index < emails.length; index += 30) {
            const chunk = emails.slice(index, index + 30);
            if (chunk.length === 0)
                continue;
            const usersSnap = await this.firebaseAdminService.firestore
                .collection('users')
                .where('email', 'in', chunk)
                .get();
            for (const doc of usersSnap.docs) {
                const data = doc.data();
                const email = this.firstString(data.email).toLowerCase();
                if (email && !userIdByEmail.has(email)) {
                    userIdByEmail.set(email, doc.id);
                }
            }
        }
        await Promise.all(emails
            .filter((email) => !userIdByEmail.has(email))
            .map(async (email) => {
            try {
                const user = await this.firebaseAdminService.auth.getUserByEmail(email);
                userIdByEmail.set(email, user.uid);
            }
            catch {
            }
        }));
        if (userIdByEmail.size === 0)
            return items;
        const nextItems = items.map((item) => {
            const apartmentId = this.firstString(item.id, item.apartmentId);
            const ownerEmail = this.firstString(item.ownerEmail).toLowerCase();
            const resolvedOwnerId = ownerEmail ? userIdByEmail.get(ownerEmail) : undefined;
            if (!apartmentId || !resolvedOwnerId)
                return item;
            const ownerId = this.firstString(item.ownerId);
            if (ownerId)
                return item;
            return {
                ...item,
                ownerId: resolvedOwnerId,
            };
        });
        return nextItems;
    }
    getBuildingStorageFolders(companyId, buildingId) {
        return this.apartmentStorageService.getBuildingStorageFolders(companyId, buildingId);
    }
    getApartmentStorageFolders(companyId, buildingId, apartmentId) {
        return this.apartmentStorageService.getApartmentStorageFolders(companyId, buildingId, apartmentId);
    }
    getApartmentStorageFolderPath(companyId, buildingId, apartmentId) {
        return this.apartmentStorageService.getApartmentStorageFolderPath(companyId, buildingId, apartmentId);
    }
    resolveApartmentStorageContext(apartmentId, data) {
        return this.apartmentStorageService.resolveApartmentStorageContext(apartmentId, data);
    }
    async markStorageFolders(ref, folderPaths, entityLabel) {
        return this.apartmentStorageService.markStorageFolders(ref, folderPaths, entityLabel);
    }
    async getApprovedBuildingOrThrow(buildingId, companyId) {
        const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
        if (!snap.exists) {
            throw new common_1.ForbiddenException('Apartments can be added only after the building request is approved');
        }
        const data = snap.data();
        const buildingCompanyId = (typeof data.companyId === 'string' ? data.companyId.trim() : '') ||
            data.managedBy?.companyId?.trim() ||
            '';
        if (!buildingCompanyId || buildingCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for building/company ownership');
        }
        if (data.editLocked === true) {
            throw new common_1.ForbiddenException('This building is locked by the platform administrator');
        }
        const status = this.firstString(data.status).toLowerCase();
        if (['pending', 'rejected', 'cancelled', 'canceled'].includes(status)) {
            throw new common_1.ForbiddenException('Apartments can be added only after the building request is approved');
        }
        return data;
    }
    getBuildingApartmentLimit(building) {
        for (const value of [building.apartmentsCount, building.apartments]) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return Math.max(0, Math.floor(parsed));
            }
        }
        return undefined;
    }
    async countBuildingApartments(buildingId, excludeApartmentId) {
        const db = this.firebaseAdminService.firestore;
        const [byBuildingId, byLegacyHouseId] = await Promise.all([
            db.collection('apartments').where('buildingId', '==', buildingId).get(),
            db.collection('apartments').where('houseId', '==', buildingId).get(),
        ]);
        const ids = new Set();
        for (const doc of [...byBuildingId.docs, ...byLegacyHouseId.docs]) {
            if (excludeApartmentId && doc.id === excludeApartmentId)
                continue;
            ids.add(doc.id);
        }
        return ids.size;
    }
    async assertBuildingApartmentCapacity(params) {
        const limit = this.getBuildingApartmentLimit(params.building);
        if (limit === undefined || params.additionalApartments <= 0) {
            return;
        }
        const existingCount = await this.countBuildingApartments(params.buildingId, params.excludeApartmentId);
        if (existingCount + params.additionalApartments > limit) {
            throw new common_1.ConflictException(`Apartment limit for this building is ${limit}. Edit the building and wait for approval before adding more apartments.`);
        }
    }
    async assertApartmentBuildingEditableForStaff(user, apartment) {
        return this.apartmentAccessService.assertApartmentBuildingEditableForStaff(user, apartment);
    }
    assertAuthenticated(user) {
        return this.apartmentAccessService.assertAuthenticated(user);
    }
    assertManagementCompanyMutation(user) {
        return this.apartmentAccessService.assertManagementCompanyMutation(user);
    }
    isStaff(user) {
        return this.apartmentAccessService.isStaff(user);
    }
    effectiveStaffCompanyId(user) {
        return this.apartmentAccessService.effectiveStaffCompanyId(user);
    }
    apartmentBelongsToStaffCompany(user, apartment) {
        return this.apartmentAccessService.apartmentBelongsToStaffCompany(user, apartment);
    }
    assertApartmentCompanyAccess(user, apartment) {
        return this.apartmentAccessService.assertApartmentCompanyAccess(user, apartment);
    }
    async getAccessibleApartmentIds(user) {
        return this.apartmentAccessService.getAccessibleApartmentIds(user);
    }
    canManageTenants(user, apartmentId, apartment) {
        void apartmentId;
        return this.apartmentAccessService.canManageTenants(user, apartment);
    }
    hasApartmentOccupant(apartment) {
        return this.apartmentAccessService.hasApartmentOccupant(apartment);
    }
    normalizeHeader(value) {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }
    normalizeApartmentNumber(value) {
        return value.trim().replace(/\s+/g, ' ').toLowerCase();
    }
    normalizeReadingConfigOverride(payload) {
        return this.apartmentMeterService.normalizeReadingConfigOverride(payload);
    }
    buildEmptyWaterReadings(apartmentId, buildingId, building, readingConfigOverride) {
        return this.apartmentMeterService.buildEmptyWaterReadings(apartmentId, buildingId, building, readingConfigOverride);
    }
    buildReadableCode(value, length, fallback) {
        return this.apartmentCodeService.buildReadableCode(value, length, fallback);
    }
    buildRandomDigits(length) {
        return this.apartmentCodeService.buildRandomDigits(length);
    }
    buildApartmentNumberCode(apartmentNumber) {
        return this.apartmentCodeService.buildApartmentNumberCode(apartmentNumber);
    }
    async getApartmentCodeContext(companyId, buildingId) {
        return this.apartmentCodeService.getApartmentCodeContext(companyId, buildingId);
    }
    buildApartmentReadableId(context, apartmentNumber) {
        return this.apartmentCodeService.buildApartmentReadableId(context, apartmentNumber);
    }
    async generateApartmentReadableId(companyId, buildingId, apartmentNumber) {
        return this.apartmentCodeService.generateApartmentReadableId(companyId, buildingId, apartmentNumber);
    }
    getCellStringByHeader(row, headerCandidates) {
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
    parseReadingPeriod(label) {
        const normalized = label.trim();
        const monthYearMatch = normalized.match(/(\d{1,2})[.\-/](\d{4})/);
        if (monthYearMatch) {
            const month = Number(monthYearMatch[1]);
            const year = Number(monthYearMatch[2]);
            if (month >= 1 && month <= 12)
                return { month, year };
        }
        const yearMonthMatch = normalized.match(/(\d{4})[.\-/](\d{1,2})/);
        if (yearMonthMatch) {
            const year = Number(yearMonthMatch[1]);
            const month = Number(yearMonthMatch[2]);
            if (month >= 1 && month <= 12)
                return { month, year };
        }
        return null;
    }
    parsePeriodFromDateCell(raw) {
        if (raw === undefined || raw === null || String(raw).trim() === '')
            return null;
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
            if (m >= 1 && m <= 12)
                return { month: m, year: y };
        }
        const byText = this.parseReadingPeriod(text);
        if (byText)
            return byText;
        const dayMonth = text.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
        if (dayMonth) {
            const month = Number(dayMonth[2]);
            if (month >= 1 && month <= 12) {
                return { month, year: new Date().getFullYear() };
            }
        }
        return null;
    }
    extractReadings(row, prefix) {
        const entries = Object.entries(row);
        const out = [];
        const isDateHeader = (header) => {
            const n = this.normalizeHeader(header);
            return n.startsWith('data') || n.includes('date') || n.includes('menesis') || n.includes('month');
        };
        const isLikelyDateColumn = (header) => {
            const n = this.normalizeHeader(header);
            return isDateHeader(header) || n === '' || n.startsWith('__empty');
        };
        const periodAt = (index) => {
            const candidate = entries[index];
            if (!candidate)
                return null;
            const [dateColName, dateValue] = candidate;
            if (!isLikelyDateColumn(dateColName))
                return null;
            const parsed = this.parsePeriodFromDateCell(dateValue);
            if (!parsed)
                return null;
            return {
                period: parsed,
                label: String(dateValue ?? dateColName).trim() || dateColName,
            };
        };
        const findNearestPeriod = (index) => {
            const next = periodAt(index + 1);
            if (next)
                return next;
            const previous = periodAt(index - 1);
            if (previous)
                return previous;
            let best = null;
            for (let j = 0; j < entries.length; j++) {
                if (j === index)
                    continue;
                const candidate = periodAt(j);
                if (!candidate)
                    continue;
                const distance = Math.abs(j - index);
                if (!best || distance < best.distance || (distance === best.distance && j > index)) {
                    best = { distance, period: candidate.period, label: candidate.label };
                }
            }
            return best ? { period: best.period, label: best.label } : null;
        };
        for (let i = 0; i < entries.length; i++) {
            const [colName, value] = entries[i];
            if (typeof colName !== 'string' ||
                !colName.includes(prefix) ||
                colName.includes('NR') ||
                value === undefined ||
                value === null ||
                String(value).trim() === '') {
                continue;
            }
            const numValue = Number.parseFloat(String(value).replace(',', '.'));
            if (!Number.isFinite(numValue))
                continue;
            let period = this.parseReadingPeriod(colName);
            let label = colName.trim();
            if (!period) {
                const nearest = findNearestPeriod(i);
                if (nearest) {
                    period = nearest.period;
                    label = nearest.label || colName.trim();
                }
            }
            if (!period)
                continue;
            out.push({ label, value: numValue, month: period.month, year: period.year });
        }
        return out.sort((a, b) => a.year - b.year || a.month - b.month);
    }
    buildSubmittedAtFromPeriod(year, month) {
        const now = new Date();
        const currentDay = now.getDate();
        const daysInTargetMonth = new Date(year, month, 0).getDate();
        const safeDay = Math.min(currentDay, daysInTargetMonth);
        return new Date(year, month - 1, safeDay, 12, 0, 0, 0);
    }
    findDueDateFromRow(row, type) {
        const keys = Object.keys(row);
        const meterToken = type === 'hot' ? 'kartsais' : 'aukstais';
        const dueDateKey = keys.find((key) => {
            const k = this.normalizeHeader(key);
            return (k.includes(meterToken) &&
                ((k.includes('derig') && k.includes('lidz')) ||
                    k.includes('check due') ||
                    k.includes('checkduedate') ||
                    k.includes('expiry') ||
                    k.includes('valid until')));
        });
        if (!dueDateKey)
            return '';
        const raw = row[dueDateKey];
        return raw === undefined || raw === null ? '' : String(raw).trim();
    }
    buildWaterReadingGroup({ apartmentId, buildingId, meterId, serialNumber, checkDueDate, readings, }) {
        const history = readings.map((reading, index) => {
            const previousValue = index > 0 ? readings[index - 1].value : 0;
            const consumption = index > 0 ? Math.max(0, reading.value - previousValue) : 0;
            const submittedAt = this.buildSubmittedAtFromPeriod(reading.year, reading.month);
            return {
                id: (0, node_crypto_1.randomUUID)(),
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
    getFileExtension(file) {
        const fileName = typeof file?.originalname === 'string' ? file.originalname.toLowerCase() : '';
        const dotIndex = fileName.lastIndexOf('.');
        return dotIndex >= 0 ? fileName.slice(dotIndex) : '';
    }
    getValueByPath(source, paths) {
        for (const path of paths) {
            const segments = path.split('.');
            let current = source;
            for (const segment of segments) {
                if (!current || typeof current !== 'object' || !(segment in current)) {
                    current = undefined;
                    break;
                }
                current = current[segment];
            }
            if (current !== undefined && current !== null && String(current).trim() !== '') {
                return current;
            }
        }
        return undefined;
    }
    asStructuredObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : undefined;
    }
    asStructuredArray(value) {
        if (Array.isArray(value)) {
            return value;
        }
        return value === undefined || value === null ? [] : [value];
    }
    sanitizeImportedText(value) {
        return String(value ?? '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }
    makeUniqueImportHeaders(headers) {
        const counts = new Map();
        return headers.map((header, index) => {
            const base = header || `column_${index + 1}`;
            const normalized = this.normalizeHeader(base) || `column_${index + 1}`;
            const count = counts.get(normalized) ?? 0;
            counts.set(normalized, count + 1);
            return count === 0 ? base : `${base}_${count}`;
        });
    }
    appendStructuredWaterReadings(row, entry, options) {
        let meterGroup;
        for (const path of options.paths) {
            const candidate = this.getValueByPath(entry, [path]);
            meterGroup = this.asStructuredObject(candidate);
            if (meterGroup)
                break;
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
            if (!historyRecord)
                continue;
            const month = Number(historyRecord.month);
            const year = Number(historyRecord.year);
            const readingValue = Number(historyRecord.currentValue ?? historyRecord.value ?? historyRecord.reading ?? historyRecord.meterValue);
            if (!Number.isInteger(month) || month < 1 || month > 12)
                continue;
            if (!Number.isInteger(year) || year < 2000 || year > 3000)
                continue;
            if (!Number.isFinite(readingValue))
                continue;
            const label = `${options.targetPrefix} ${String(month).padStart(2, '0')}/${year}`;
            row[label] = readingValue;
        }
    }
    looksLikeImportEntry(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }
        const entry = value;
        return Boolean(this.getValueByPath(entry, [
            'number',
            'apartmentNumber',
            'dz',
            'apartment.number',
            'address',
            'owner',
        ]));
    }
    extractImportEntries(value) {
        if (Array.isArray(value)) {
            return value.flatMap((item) => this.extractImportEntries(item));
        }
        if (!value || typeof value !== 'object') {
            return [];
        }
        const record = value;
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
    normalizeStructuredImportRow(entry) {
        const row = {};
        const assign = (target, paths) => {
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
    parseJsonImportRows(file) {
        let parsed;
        try {
            parsed = JSON.parse(file.buffer.toString('utf-8'));
        }
        catch {
            throw new common_1.BadRequestException('Invalid JSON file');
        }
        const entries = this.extractImportEntries(parsed);
        if (entries.length === 0) {
            throw new common_1.BadRequestException('JSON file does not contain apartment records');
        }
        return entries.map((entry) => this.normalizeStructuredImportRow(entry));
    }
    parseXmlImportRows(file) {
        const parser = new fast_xml_parser_1.XMLParser({
            ignoreAttributes: false,
            trimValues: true,
            parseTagValue: true,
        });
        let parsed;
        try {
            parsed = parser.parse(file.buffer.toString('utf-8'));
        }
        catch {
            throw new common_1.BadRequestException('Invalid XML file');
        }
        const entries = this.extractImportEntries(parsed);
        if (entries.length === 0) {
            throw new common_1.BadRequestException('XML file does not contain apartment records');
        }
        return entries.map((entry) => this.normalizeStructuredImportRow(entry));
    }
    parseCsvImportRows(file) {
        const text = file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
        const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
        const commaCount = (firstLine.match(/,/g) ?? []).length;
        const semicolonCount = (firstLine.match(/;/g) ?? []).length;
        const delimiter = semicolonCount > commaCount ? ';' : ',';
        const rows = [];
        let row = [];
        let cell = '';
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            const next = text[index + 1];
            if (char === '"') {
                if (quoted && next === '"') {
                    cell += '"';
                    index += 1;
                }
                else {
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
                if (char === '\r' && next === '\n')
                    index += 1;
                row.push(cell);
                if (row.some((value) => value.trim()))
                    rows.push(row);
                row = [];
                cell = '';
                continue;
            }
            cell += char;
        }
        row.push(cell);
        if (row.some((value) => value.trim()))
            rows.push(row);
        if (rows.length < 2) {
            throw new common_1.BadRequestException('CSV file does not contain apartment records');
        }
        const headers = this.makeUniqueImportHeaders(rows[0].map((value) => this.sanitizeImportedText(value)));
        return rows.slice(1).map((values) => {
            const item = {};
            for (let index = 0; index < headers.length; index += 1) {
                const header = headers[index] || `column_${index + 1}`;
                item[header] = this.sanitizeImportedText(values[index] ?? '');
            }
            return item;
        });
    }
    async parseXlsxImportRows(file) {
        const workbook = new exceljs_1.Workbook();
        try {
            const workbookBuffer = file.buffer;
            await workbook.xlsx.load(workbookBuffer);
        }
        catch {
            throw new common_1.BadRequestException('Invalid XLSX file');
        }
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            throw new common_1.BadRequestException('XLSX file does not contain any worksheets');
        }
        const rawHeaders = [];
        worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
            const value = this.sanitizeImportedText(cell.text || cell.value);
            rawHeaders[columnNumber - 1] = value || `column_${columnNumber}`;
        });
        if (rawHeaders.length === 0 || !rawHeaders.some((header) => header.trim())) {
            throw new common_1.BadRequestException('XLSX file does not contain apartment records');
        }
        const headers = this.makeUniqueImportHeaders(rawHeaders);
        const rows = [];
        worksheet.eachRow({ includeEmpty: false }, (worksheetRow, rowNumber) => {
            if (rowNumber === 1)
                return;
            const item = {};
            let hasValue = false;
            for (let index = 0; index < headers.length; index += 1) {
                const cell = worksheetRow.getCell(index + 1);
                const value = this.sanitizeImportedText(cell.text || cell.value);
                item[headers[index] || `column_${index + 1}`] = value;
                hasValue = hasValue || value.length > 0;
            }
            if (hasValue)
                rows.push(item);
        });
        if (rows.length === 0) {
            throw new common_1.BadRequestException('XLSX file does not contain apartment records');
        }
        return rows;
    }
    async parseImportRows(file) {
        const extension = this.getFileExtension(file);
        const mimeType = typeof file.mimetype === 'string' ? file.mimetype.toLowerCase() : '';
        const isXlsx = extension === '.xlsx' ||
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
        throw new common_1.BadRequestException('Only CSV, JSON, XML, and XLSX files are supported');
    }
    async importFromFile(input) {
        const { request, user, file, buildingId, companyId } = input;
        this.assertAuthenticated(user);
        this.assertManagementCompanyMutation(user);
        const userRole = user.role;
        if (!userRole || !['ManagementCompany', 'Accountant'].includes(userRole)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        if (!buildingId || !companyId) {
            throw new common_1.BadRequestException('Building ID and Company ID are required');
        }
        if (this.effectiveStaffCompanyId(user) !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'apartments:import', user.uid), 5, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        const db = this.firebaseAdminService.firestore;
        const importBuildingData = await this.getApprovedBuildingOrThrow(buildingId, companyId);
        const fileSize = file.size ?? file.buffer?.length ?? 0;
        if (!file.buffer || fileSize <= 0) {
            throw new common_1.BadRequestException('File is required');
        }
        if (fileSize > APARTMENT_IMPORT_MAX_BYTES) {
            throw new common_1.BadRequestException('Apartment import file is too large');
        }
        const rows = await this.parseImportRows(file);
        if (rows.length > APARTMENT_IMPORT_MAX_ROWS) {
            throw new common_1.BadRequestException(`Apartment import is limited to ${APARTMENT_IMPORT_MAX_ROWS} rows`);
        }
        const existingApartmentsSnapshot = await db
            .collection('apartments')
            .where('buildingId', '==', buildingId)
            .get();
        const existingApartmentNumbers = new Set(existingApartmentsSnapshot.docs
            .map((apartmentDoc) => apartmentDoc.data().number)
            .filter((number) => typeof number === 'string' && number.trim() !== '')
            .map((n) => this.normalizeApartmentNumber(n)));
        const importedApartmentNumbers = new Set();
        const importedApartmentIds = [];
        const importedApartmentStorageFolders = [];
        const writeOperations = [];
        const codeContext = await this.getApartmentCodeContext(companyId, buildingId);
        const results = {
            imported: 0,
            errors: [],
            skippedDuplicates: [],
            createdApartments: [],
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
        const uniqueNewApartmentNumbers = new Set();
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
            if (!apartmentNumber)
                continue;
            const normalizedApartmentNumber = this.normalizeApartmentNumber(apartmentNumber);
            if (existingApartmentNumbers.has(normalizedApartmentNumber))
                continue;
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
                const parseNum = (v) => {
                    const n = Number.parseFloat(String(v ?? '').replace(',', '.'));
                    return Number.isFinite(n) ? n : undefined;
                };
                const buildFallbackReading = (params) => {
                    const now = new Date();
                    const month = now.getMonth() + 1;
                    const year = now.getFullYear();
                    const consumption = Math.max(0, params.currentValue - params.previousValue);
                    return {
                        id: (0, node_crypto_1.randomUUID)(),
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
                if (!apartmentNumber)
                    continue;
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
                const apartmentData = {
                    buildingId,
                    number: apartmentNumber,
                    normalizedNumber: normalizedApartmentNumber,
                    companyId,
                    companyIds: [companyId],
                    storageApartmentId: apartmentRef.id,
                    readableId,
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                };
                basicFields.forEach((field) => {
                    if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
                        if (field === 'Kadastra numurs')
                            apartmentData.cadastralNumber = row[field].toString();
                        else if (field === 'Adrese')
                            apartmentData.address = row[field].toString();
                        else if (field === 'Stavs')
                            apartmentData.floor = row[field].toString();
                        else if (field === 'E pasts Reķiniem')
                            apartmentData.ownerEmail = row[field].toString();
                        else if (field === 'Īpašnieks')
                            apartmentData.owner = row[field].toString();
                        else if (field === 'Domājamā daļa')
                            apartmentData.cadastralPart = row[field].toString();
                        else if (field === 'Daļa (kopīpašums)')
                            apartmentData.commonPropertyShare = row[field].toString();
                        else if (field === 'DZ t')
                            apartmentData.apartmentType = row[field].toString();
                        else if (field === 'Apkure')
                            apartmentData.heatingArea = parseFloat(String(row[field]));
                        else if (field === 'Apsaimn')
                            apartmentData.managementArea = parseFloat(String(row[field]));
                        else if (field === 'Dekl iedz')
                            apartmentData.declaredResidents = parseInt(String(row[field]), 10);
                    }
                });
                const waterReadings = {};
                const hotWaterCheckDueDate = this.findDueDateFromRow(row, 'hot');
                const coldWaterCheckDueDate = this.findDueDateFromRow(row, 'cold');
                const hotWaterReadings = this.extractReadings(row, 'Kartsais');
                const hotCurrent = parseNum(row['Kartsais_1']);
                const hotPrevious = parseNum(row['Kartsais']);
                if (hotWaterMeterNumber || hotWaterReadings.length > 0 || hotCurrent !== undefined) {
                    const hotWaterMeterId = (0, node_crypto_1.randomUUID)();
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
                    const coldWaterMeterId = (0, node_crypto_1.randomUUID)();
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
                results.createdApartments.push(`${apartmentNumber} (${apartmentData.address || 'N/A'}) - Собственник: ${apartmentData.owner || 'N/A'}`);
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.errors.push(`Row ${i + 1}: ${errorMsg}`);
            }
        }
        if (importedApartmentIds.length > 0) {
            await this.apartmentsRepository.commitInChunks(writeOperations);
            await db.collection('buildings').doc(buildingId).set({ apartmentIds: firestore_1.FieldValue.arrayUnion(...importedApartmentIds) }, { merge: true });
            await Promise.all(importedApartmentStorageFolders.map((apartment) => this.markStorageFolders(db.collection('apartments').doc(apartment.id), [
                ...this.getBuildingStorageFolders(companyId, buildingId),
                ...this.getApartmentStorageFolders(companyId, buildingId, apartment.id),
            ], 'imported apartment')));
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
    mapApartmentDoc(id, data) {
        const createdAtRaw = data.createdAt;
        const createdAt = createdAtRaw instanceof Date
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
    async list(request, user, query) {
        this.assertAuthenticated(user);
        const companyId = typeof query.companyId === 'string' ? query.companyId.trim() : '';
        const buildingId = typeof query.buildingId === 'string' ? query.buildingId.trim() : '';
        const residentId = typeof query.residentId === 'string' ? query.residentId.trim() : '';
        if (residentId && !this.isStaff(user) && residentId !== user.uid) {
            throw new common_1.ForbiddenException('Access denied');
        }
        await this.enforceRateLimit(request, 'apartments:list', `${user.uid}:${companyId || buildingId || residentId || 'all'}`, 40);
        const db = this.firebaseAdminService.firestore;
        let snapshot;
        if (residentId) {
            snapshot = await db.collection('apartments').where('residentId', '==', residentId).get();
        }
        else if (buildingId) {
            snapshot = await db.collection('apartments').where('buildingId', '==', buildingId).get();
        }
        else if (companyId) {
            if (!this.isStaff(user) || this.effectiveStaffCompanyId(user) !== companyId) {
                throw new common_1.ForbiddenException('Access denied for company');
            }
            const [byArray, byLegacy] = await Promise.all([
                db.collection('apartments').where('companyIds', 'array-contains', companyId).get(),
                db.collection('apartments').where('companyId', '==', companyId).get(),
            ]);
            const merged = new Map();
            for (const doc of [...byArray.docs, ...byLegacy.docs]) {
                merged.set(doc.id, doc.data());
            }
            const items = this.sortApartmentItems(Array.from(merged.entries()).map(([id, data]) => this.mapApartmentDoc(id, data)));
            const withOwnerAccess = await this.withResolvedOwnerAccess(items);
            return { items: await this.withOwnerInvitationDates(withOwnerAccess) };
        }
        else {
            const userRole = user.role;
            if (!userRole || !['ManagementCompany', 'Accountant'].includes(userRole)) {
                throw new common_1.ForbiddenException('Insufficient permissions');
            }
            const scopedCompanyId = this.effectiveStaffCompanyId(user);
            const [byArray, byLegacy] = await Promise.all([
                db.collection('apartments').where('companyIds', 'array-contains', scopedCompanyId).get(),
                db.collection('apartments').where('companyId', '==', scopedCompanyId).get(),
            ]);
            const merged = new Map();
            for (const doc of [...byArray.docs, ...byLegacy.docs]) {
                merged.set(doc.id, doc.data());
            }
            const items = this.sortApartmentItems(Array.from(merged.entries()).map(([id, data]) => this.mapApartmentDoc(id, data)));
            const withOwnerAccess = await this.withResolvedOwnerAccess(items);
            return { items: await this.withOwnerInvitationDates(withOwnerAccess) };
        }
        const rawItems = snapshot.docs.map((doc) => this.mapApartmentDoc(doc.id, doc.data()));
        let accessibleItems = rawItems;
        if (this.isStaff(user)) {
            accessibleItems = rawItems.filter((item) => this.apartmentBelongsToStaffCompany(user, item));
        }
        else if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
            accessibleItems = rawItems.filter((item) => accessibleApartmentIds.includes(this.firstString(item.id)));
        }
        else {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const items = this.sortApartmentItems(accessibleItems);
        const withOwnerAccess = await this.withResolvedOwnerAccess(items);
        return { items: await this.withOwnerInvitationDates(withOwnerAccess) };
    }
    async byId(request, user, apartmentId) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        await this.enforceRateLimit(request, 'apartments:by-id', `${user.uid}:${apartmentId}`, 60);
        const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const data = snap.data();
        if (this.isStaff(user)) {
            this.assertApartmentCompanyAccess(user, data);
        }
        else if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
            if (!accessibleApartmentIds.includes(snap.id)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const [withOwnerAccess] = await this.withResolvedOwnerAccess([this.mapApartmentDoc(snap.id, data)]);
        const [item] = await this.withOwnerInvitationDates([withOwnerAccess]);
        return item;
    }
    async create(request, user, payload) {
        this.assertAuthenticated(user);
        this.assertManagementCompanyMutation(user);
        const userRole = user.role;
        if (!userRole || !['ManagementCompany', 'Accountant'].includes(userRole)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const number = typeof payload.number === 'string' ? payload.number.trim() : '';
        const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId.trim() : '';
        const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
        if (!number || !buildingId || !companyId) {
            throw new common_1.BadRequestException('number, buildingId and companyId are required');
        }
        if (this.effectiveStaffCompanyId(user) !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
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
            throw new common_1.BadRequestException('Квартира с таким номером уже существует в этом доме');
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await ref.set(data);
        await this.markStorageFolders(ref, [
            ...this.getBuildingStorageFolders(companyId, buildingId),
            ...this.getApartmentStorageFolders(companyId, buildingId, ref.id),
        ], 'apartment');
        await db.collection('buildings').doc(buildingId).set({ apartmentIds: firestore_1.FieldValue.arrayUnion(ref.id) }, { merge: true });
        return { id: ref.id, ...data };
    }
    async update(request, user, apartmentId, payload) {
        this.assertAuthenticated(user);
        this.assertManagementCompanyMutation(user);
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        await this.enforceRateLimit(request, 'apartments:update', `${user.uid}:${apartmentId}`, 40);
        const db = this.firebaseAdminService.firestore;
        const ref = db.collection('apartments').doc(apartmentId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const current = snap.data();
        this.assertApartmentCompanyAccess(user, current);
        await this.assertApartmentBuildingEditableForStaff(user, current);
        const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
        const scopedCompanyId = this.effectiveStaffCompanyId(user);
        const currentCompanyId = this.apartmentInvitationService.resolveApartmentCompanyId(current);
        const updatedCompanyId = typeof payload.companyId === 'string'
            ? payload.companyId.trim()
            : scopedCompanyId;
        if (updatedCompanyId !== scopedCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const updatedBuildingId = typeof payload.buildingId === 'string'
            ? payload.buildingId.trim()
            : (typeof current.buildingId === 'string' ? current.buildingId : undefined);
        const updatedNumber = typeof payload.number === 'string'
            ? payload.number
            : (typeof current.number === 'string' ? current.number : undefined);
        const shouldRegenerateReadableId = Boolean((payload.companyId && updatedCompanyId !== currentCompanyId) ||
            (payload.buildingId && updatedBuildingId !== current.buildingId) ||
            (payload.number && updatedNumber !== current.number));
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
                throw new common_1.BadRequestException('РљРІР°СЂС‚РёСЂР° СЃ С‚Р°РєРёРј РЅРѕРјРµСЂРѕРј СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ РІ СЌС‚РѕРј РґРѕРјРµ');
            }
        }
        const readableId = shouldRegenerateReadableId && updatedCompanyId && updatedBuildingId && updatedNumber
            ? await this.generateApartmentReadableId(updatedCompanyId, updatedBuildingId, updatedNumber)
            : current.readableId;
        const sanitizedWaterReadings = this.apartmentMeterService.sanitizeWaterReadingPatch(payload.waterReadings);
        const updateData = {
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (typeof payload.number === 'string') {
            updateData.number = payload.number.trim();
            updateData.normalizedNumber = this.normalizeApartmentNumber(payload.number);
        }
        if (typeof payload.buildingId === 'string')
            updateData.buildingId = payload.buildingId.trim();
        if (typeof payload.companyId === 'string') {
            updateData.companyId = updatedCompanyId;
            updateData.companyIds = [updatedCompanyId];
        }
        if (typeof payload.address === 'string')
            updateData.address = payload.address.trim();
        if (typeof payload.floor === 'number')
            updateData.floor = payload.floor;
        if (typeof payload.area === 'number')
            updateData.area = payload.area;
        if (typeof payload.declaredResidents === 'number')
            updateData.declaredResidents = payload.declaredResidents;
        if (typeof payload.cadastralNumber === 'string')
            updateData.cadastralNumber = payload.cadastralNumber.trim();
        if (typeof payload.cadastralPart === 'string')
            updateData.cadastralPart = payload.cadastralPart.trim();
        if (typeof payload.commonPropertyShare === 'string')
            updateData.commonPropertyShare = payload.commonPropertyShare.trim();
        if (typeof payload.apartmentType === 'string')
            updateData.apartmentType = payload.apartmentType.trim();
        if (typeof payload.heatingArea === 'number')
            updateData.heatingArea = payload.heatingArea;
        if (typeof payload.managementArea === 'number')
            updateData.managementArea = payload.managementArea;
        if (typeof readableId === 'string' && readableId.trim())
            updateData.readableId = readableId;
        if (readingConfigOverride)
            updateData.readingConfigOverride = readingConfigOverride;
        if (sanitizedWaterReadings) {
            for (const [meterKey, meterPatch] of Object.entries(sanitizedWaterReadings)) {
                for (const [field, value] of Object.entries(meterPatch)) {
                    updateData[`waterReadings.${meterKey}.${field}`] = value;
                }
            }
        }
        await ref.update(updateData);
        return { success: true };
    }
    async storageSummary(request, user, apartmentId) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        await this.enforceRateLimit(request, 'apartments:storage-summary', `${user.uid}:${apartmentId}`, 60);
        const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const data = snap.data();
        this.assertApartmentCompanyAccess(user, data);
        const context = this.resolveApartmentStorageContext(apartmentId, data);
        if (!context) {
            return { path: null, fileCount: 0, hasUserFiles: false };
        }
        return this.apartmentStorageService.getStorageFolderSummary(context.path);
    }
    async remove(request, user, apartmentId) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        this.assertManagementCompanyMutation(user);
        if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        await this.enforceRateLimit(request, 'apartments:delete', `${user.uid}:${apartmentId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const ref = db.collection('apartments').doc(apartmentId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const data = snap.data();
        this.assertApartmentCompanyAccess(user, data);
        await this.assertApartmentBuildingEditableForStaff(user, data);
        if (this.hasApartmentOccupant(data)) {
            throw new common_1.BadRequestException('Нельзя удалить квартиру: сначала отвяжите жильцов');
        }
        const context = this.resolveApartmentStorageContext(apartmentId, data);
        if (context) {
            await this.apartmentStorageService.deleteStorageFolder(context.path);
        }
        const buildingId = typeof data.buildingId === 'string' ? data.buildingId : undefined;
        await ref.delete();
        if (buildingId) {
            await db.collection('buildings').doc(buildingId).set({ apartmentIds: firestore_1.FieldValue.arrayRemove(apartmentId) }, { merge: true });
        }
        return { success: true };
    }
    async unassignResident(request, user, apartmentId) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        await this.enforceRateLimit(request, 'apartments:unassign-resident', `${user.uid}:${apartmentId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        await this.assertApartmentBuildingEditableForStaff(user, apartment);
        const userIdsToDetach = new Set();
        const addUserId = (value) => {
            if (typeof value === 'string' && value.trim()) {
                userIdsToDetach.add(value.trim());
            }
        };
        addUserId(apartment.residentId);
        addUserId(apartment.ownerId);
        if (Array.isArray(apartment.tenants)) {
            for (const tenant of apartment.tenants) {
                if (tenant && typeof tenant === 'object') {
                    addUserId(tenant.userId);
                }
            }
        }
        await apartmentRef.set({
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
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        await Promise.all(Array.from(userIdsToDetach).map((targetUserId) => db.collection('users').doc(targetUserId).set({
            apartmentIds: firestore_1.FieldValue.arrayRemove(apartmentId),
            apartmentId: null,
            updatedAt: new Date().toISOString(),
        }, { merge: true })));
        return { success: true };
    }
    async updateOwner(request, user, apartmentId, ownerEmail, ownerData) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        const email = ownerEmail?.trim().toLowerCase();
        if (!email)
            throw new common_1.BadRequestException('email is required');
        await this.enforceRateLimit(request, 'apartments:update-owner', `${user.uid}:${apartmentId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        await this.assertApartmentBuildingEditableForStaff(user, apartment);
        const firstName = typeof ownerData?.firstName === 'string' ? ownerData.firstName.trim() : '';
        const lastName = typeof ownerData?.lastName === 'string' ? ownerData.lastName.trim() : '';
        const contractNumber = typeof ownerData?.contractNumber === 'string' ? ownerData.contractNumber.trim() : '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;
        let ownerId;
        try {
            const existing = await this.firebaseAdminService.auth.getUserByEmail(email);
            ownerId = existing.uid;
        }
        catch {
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
        await apartmentRef.set({
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
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        try {
            const profileUpdates = [];
            if (previousOwnerId && previousOwnerId !== ownerId) {
                profileUpdates.push(db.collection('users').doc(previousOwnerId).set({
                    apartmentIds: firestore_1.FieldValue.arrayRemove(apartmentId),
                    apartmentId: null,
                    updatedAt: new Date().toISOString(),
                }, { merge: true }));
            }
            await Promise.all(profileUpdates);
        }
        catch (error) {
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
        }
        catch (error) {
            this.logger.error('Failed to send owner invitation email', error instanceof Error ? error.stack : String(error));
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
        }
        catch (error) {
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
    async removeOwner(request, user, apartmentId) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        await this.enforceRateLimit(request, 'apartments:remove-owner', `${user.uid}:${apartmentId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        await this.assertApartmentBuildingEditableForStaff(user, apartment);
        const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId.trim() : '';
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.trim().toLowerCase() : '';
        if (!ownerId && !ownerEmail) {
            throw new common_1.NotFoundException('Owner not found in this apartment');
        }
        await apartmentRef.set({
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
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        if (ownerId) {
            await db.collection('users').doc(ownerId).set({
                apartmentIds: firestore_1.FieldValue.arrayRemove(apartmentId),
                apartmentId: null,
                updatedAt: new Date().toISOString(),
            }, { merge: true }).catch((error) => {
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
    async addOrInviteTenant(request, user, apartmentId, emailInput, tenantData) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        const email = emailInput?.trim().toLowerCase();
        if (!email)
            throw new common_1.BadRequestException('email is required');
        await this.enforceRateLimit(request, 'apartments:add-tenant', `${user.uid}:${apartmentId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        await this.assertApartmentBuildingEditableForStaff(user, apartment);
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        if (typeof apartment.ownerEmail === 'string' && apartment.ownerEmail.trim()) {
            if (email.toLowerCase() === apartment.ownerEmail.toLowerCase()) {
                throw new common_1.BadRequestException('Email арендатора не может совпадать с email владельца квартиры');
            }
        }
        let authUserId = '';
        try {
            const existing = await this.firebaseAdminService.auth.getUserByEmail(email);
            authUserId = existing.uid;
        }
        catch {
            authUserId = '';
        }
        const tenants = Array.isArray(apartment.tenants)
            ? apartment.tenants
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
        const tenantRecord = {
            email,
            name: fullName,
            permissions,
            apartmentId,
            status: 'Pending',
            invitedAt: new Date(),
        };
        if (authUserId)
            tenantRecord.userId = authUserId;
        if (firstName)
            tenantRecord.firstName = firstName;
        if (lastName)
            tenantRecord.lastName = lastName;
        if (phone)
            tenantRecord.phone = phone;
        if (contractNumber)
            tenantRecord.contractNumber = contractNumber;
        if (fromDate)
            tenantRecord.fromDate = fromDate;
        if (until)
            tenantRecord.until = until;
        if (authUserId) {
            await db.collection('users').doc(authUserId).set({
                uid: authUserId,
                email,
                apartmentId,
                apartmentIds: firestore_1.FieldValue.arrayUnion(apartmentId),
                updatedAt: new Date().toISOString(),
            }, { merge: true });
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
        await apartmentRef.set({ tenants: nextTenants, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
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
        }
        catch (error) {
            this.logger.error('Failed to send tenant invitation email', error instanceof Error ? error.stack : String(error));
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
        }
        catch (error) {
            this.logger.error('Failed to send apartment request email to platform admins', error instanceof Error ? error.stack : String(error));
        }
        return { success: true, invitationLink, invitationId };
    }
    async removeTenant(request, user, apartmentId, userId) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim() || !userId?.trim()) {
            throw new common_1.BadRequestException('apartmentId and userId are required');
        }
        await this.enforceRateLimit(request, 'apartments:remove-tenant', `${user.uid}:${apartmentId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        await this.assertApartmentBuildingEditableForStaff(user, apartment);
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const tenants = Array.isArray(apartment.tenants)
            ? apartment.tenants
            : [];
        const normalizedRemovedUser = userId.trim().toLowerCase();
        const removedTenant = tenants.find((tenant) => {
            const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
            const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
            return tenantUserId === userId || Boolean(tenantEmail && tenantEmail === normalizedRemovedUser);
        });
        if (!removedTenant) {
            throw new common_1.NotFoundException('Tenant not found in this apartment');
        }
        const removedTenantUserId = typeof removedTenant.userId === 'string' ? removedTenant.userId.trim() : '';
        const removedTenantEmail = typeof removedTenant.email === 'string' ? removedTenant.email.trim().toLowerCase() : '';
        const next = tenants.filter((tenant) => {
            const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
            const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
            return (tenantUserId !== userId &&
                (!removedTenantUserId || tenantUserId !== removedTenantUserId) &&
                (!tenantEmail || tenantEmail !== normalizedRemovedUser) &&
                (!removedTenantEmail || tenantEmail !== removedTenantEmail));
        });
        const updateData = {
            tenants: next,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (next.length === 0) {
            updateData.residentId = null;
        }
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
        const userIdsToDetach = new Set();
        if (removedTenantUserId) {
            userIdsToDetach.add(removedTenantUserId);
        }
        else if (!userId.includes('@')) {
            userIdsToDetach.add(userId.trim());
        }
        if (ownerId && ((ownerId === userId) || (ownerEmail && ownerEmail === normalizedRemovedUser))) {
            userIdsToDetach.add(ownerId);
        }
        await Promise.all(Array.from(userIdsToDetach).map((targetUserId) => db.collection('users').doc(targetUserId).set({
            apartmentIds: firestore_1.FieldValue.arrayRemove(apartmentId),
            apartmentId: null,
            updatedAt: new Date().toISOString(),
        }, { merge: true }).catch((error) => {
            this.logger.error(`Failed to detach apartment from user ${targetUserId}`, error instanceof Error ? error.stack : String(error));
        })));
        return { success: true };
    }
    async updateTenant(request, user, apartmentId, userId, tenantData) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim() || !userId?.trim()) {
            throw new common_1.BadRequestException('apartmentId and userId are required');
        }
        await this.enforceRateLimit(request, 'apartments:update-tenant', `${user.uid}:${apartmentId}`, 30);
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        await this.assertApartmentBuildingEditableForStaff(user, apartment);
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const tenants = Array.isArray(apartment.tenants)
            ? apartment.tenants
            : [];
        const normalizedTenantId = userId.trim().toLowerCase();
        let found = false;
        const nextTenants = tenants.map((tenant) => {
            const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
            const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
            const matches = tenantUserId === userId || Boolean(tenantEmail && tenantEmail === normalizedTenantId);
            if (!matches)
                return tenant;
            found = true;
            const firstName = typeof tenantData.firstName === 'string' ? tenantData.firstName.trim() : '';
            const lastName = typeof tenantData.lastName === 'string' ? tenantData.lastName.trim() : '';
            const phone = typeof tenantData.phone === 'string' ? tenantData.phone.trim() : '';
            const fromDate = typeof tenantData.fromDate === 'string' ? tenantData.fromDate.trim() : '';
            const until = typeof tenantData.until === 'string' ? tenantData.until.trim() : '';
            const status = typeof tenantData.status === 'string' ? tenantData.status.trim() : '';
            const currentPermissions = Array.isArray(tenant.permissions)
                ? tenant.permissions.filter((permission) => typeof permission === 'string')
                : ['submitMeter'];
            const nextPermissions = new Set(currentPermissions);
            nextPermissions.add('submitMeter');
            if (tenantData.canViewDocuments === true) {
                nextPermissions.add('viewDocuments');
            }
            else if (tenantData.canViewDocuments === false) {
                nextPermissions.delete('viewDocuments');
                nextPermissions.delete('documents');
            }
            const name = [firstName, lastName].filter(Boolean).join(' ') || this.firstString(tenant.name, tenant.email);
            const nextTenant = {
                ...tenant,
                name,
                permissions: Array.from(nextPermissions),
            };
            if (firstName)
                nextTenant.firstName = firstName;
            else
                delete nextTenant.firstName;
            if (lastName)
                nextTenant.lastName = lastName;
            else
                delete nextTenant.lastName;
            if (phone)
                nextTenant.phone = phone;
            else
                delete nextTenant.phone;
            if (fromDate)
                nextTenant.fromDate = fromDate;
            else
                delete nextTenant.fromDate;
            if (until)
                nextTenant.until = until;
            else
                delete nextTenant.until;
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
            throw new common_1.NotFoundException('Tenant not found in this apartment');
        }
        await apartmentRef.set({ tenants: nextTenants, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        return { success: true };
    }
    async resendOwnerInvitation(request, user, apartmentId, ownerEmail) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim() || !ownerEmail?.trim()) {
            throw new common_1.BadRequestException('apartmentId and ownerEmail are required');
        }
        await this.enforceRateLimit(request, 'apartments:resend-owner-invitation', `${user.uid}:${apartmentId}`, 30);
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        await this.assertApartmentBuildingEditableForStaff(user, apartment);
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const currentOwnerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.toLowerCase() : '';
        if (currentOwnerEmail !== ownerEmail.toLowerCase()) {
            throw new common_1.NotFoundException('Owner not found in this apartment');
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
        let ownerId;
        try {
            const existing = await this.firebaseAdminService.auth.getUserByEmail(ownerEmail.toLowerCase());
            ownerId = existing.uid;
        }
        catch {
            ownerId = undefined;
        }
        const ownerInvitationContext = await this.apartmentInvitationService.resolveInvitationContext(apartment);
        const ownerName = this.firstString(apartment.owner, apartment.ownerName, [this.firstString(apartment.ownerFirstName), this.firstString(apartment.ownerLastName)].filter(Boolean).join(' '));
        await this.apartmentInvitationService.createOwnerInvitationNotification({
            ownerId,
            invitationLink,
            companyName: ownerInvitationContext.companyName,
            buildingName: ownerInvitationContext.buildingName,
            apartmentNumber: ownerInvitationContext.apartmentNumber,
        });
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
        }
        catch (error) {
            this.logger.error('Failed to send owner invitation email', error instanceof Error ? error.stack : String(error));
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
        }
        catch (error) {
            this.logger.error('Failed to send apartment request email to platform admins', error instanceof Error ? error.stack : String(error));
        }
        await apartmentRef.set({
            ownerInvitedAt: new Date(),
            ownerInvitationId: invitationId,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
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
    async resendTenantInvitation(request, user, apartmentId, tenantEmail) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim() || !tenantEmail?.trim()) {
            throw new common_1.BadRequestException('apartmentId and tenantEmail are required');
        }
        await this.enforceRateLimit(request, 'apartments:resend-tenant-invitation', `${user.uid}:${apartmentId}`, 30);
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        await this.assertApartmentBuildingEditableForStaff(user, apartment);
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const tenants = Array.isArray(apartment.tenants)
            ? apartment.tenants
            : [];
        const tenant = tenants.find((t) => typeof t.email === 'string' && t.email.toLowerCase() === tenantEmail.toLowerCase());
        if (!tenant) {
            throw new common_1.NotFoundException('Tenant not found in this apartment');
        }
        const invitationContext = await this.apartmentInvitationService.resolveInvitationContext(apartment);
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
        }
        catch (error) {
            this.logger.error('Failed to send tenant invitation email', error instanceof Error ? error.stack : String(error));
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
        }
        catch (error) {
            this.logger.error('Failed to send apartment request email to platform admins', error instanceof Error ? error.stack : String(error));
        }
        const updatedTenants = tenants.map((t) => typeof t.email === 'string' && t.email.toLowerCase() === tenantEmail.toLowerCase()
            ? { ...t, invitedAt: new Date() }
            : t);
        await apartmentRef.set({ tenants: updatedTenants, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
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
    async getAuditLogs(request, user, apartmentId, limit = 50) {
        this.assertAuthenticated(user);
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        if ((0, role_constants_1.normalizeUserRole)(user.role) !== 'ManagementCompany') {
            throw new common_1.ForbiddenException('Audit logs are only available for management company');
        }
        await this.enforceRateLimit(request, 'apartments:audit-logs', `${user.uid}:${apartmentId}`, 60);
        const db = this.firebaseAdminService.firestore;
        const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        this.assertApartmentCompanyAccess(user, apartment);
        const logs = await db
            .collection('audit_logs')
            .where('apartmentId', '==', apartmentId)
            .get();
        const sortedDocs = logs.docs.sort((a, b) => {
            return this.timestampMillis(b.data().createdAt) - this.timestampMillis(a.data().createdAt);
        }).slice(0, limit);
        return {
            items: sortedDocs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt instanceof Date
                    ? doc.data().createdAt.toISOString()
                    : typeof doc.data().createdAt === 'string'
                        ? doc.data().createdAt
                        : typeof doc.data().createdAt?.toDate === 'function'
                            ? doc.data().createdAt.toDate().toISOString()
                            : new Date().toISOString(),
            })),
        };
    }
    async migrateApartmentReadableIds() {
        const db = this.firebaseAdminService.firestore;
        const snapshot = await db.collection('apartments').get();
        let updated = 0;
        let skipped = 0;
        const errors = [];
        const writeOperations = [];
        const contextCache = new Map();
        for (const doc of snapshot.docs) {
            try {
                const apartment = doc.data();
                if (apartment.readableId) {
                    skipped += 1;
                    continue;
                }
                const companyId = typeof apartment.companyId === 'string'
                    ? apartment.companyId
                    : (Array.isArray(apartment.companyIds) && apartment.companyIds.length > 0
                        ? apartment.companyIds.find((value) => typeof value === 'string' && value.trim().length > 0) ?? ''
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
                    batch.set(doc.ref, { readableId, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
                });
                updated++;
            }
            catch (error) {
                errors.push({
                    apartmentId: doc.id,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }
        await this.apartmentsRepository.commitInChunks(writeOperations);
        return { updated, total: snapshot.size, skipped, errors };
    }
};
exports.ApartmentsService = ApartmentsService;
exports.ApartmentsService = ApartmentsService = ApartmentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        email_service_1.EmailService,
        apartments_repository_1.ApartmentsRepository,
        apartment_access_service_1.ApartmentAccessService,
        apartment_code_service_1.ApartmentCodeService,
        apartment_invitation_service_1.ApartmentInvitationService,
        apartment_meter_service_1.ApartmentMeterService,
        apartment_storage_service_1.ApartmentStorageService])
], ApartmentsService);

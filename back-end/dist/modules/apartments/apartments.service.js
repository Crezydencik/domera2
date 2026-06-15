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
const invitation_token_1 = require("../../common/utils/invitation-token");
const email_service_1 = require("../emails/email.service");
const APARTMENT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
let ApartmentsService = class ApartmentsService {
    constructor(firebaseAdminService, rateLimitService, auditLogService, emailService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.emailService = emailService;
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
    getBuildingStorageFolders(companyId, buildingId) {
        const base = `companies/${companyId}/buildings/${buildingId}`;
        return [
            base,
            `${base}/apartments`,
            `${base}/invoices`,
            `${base}/documents`,
            `${base}/photos`,
        ];
    }
    getApartmentStorageFolders(companyId, buildingId, apartmentId) {
        const base = `companies/${companyId}/buildings/${buildingId}/apartments/${apartmentId}`;
        return [
            base,
            `${base}/invoices`,
            `${base}/documents`,
            `${base}/meter-readings`,
        ];
    }
    getApartmentStorageFolderPath(companyId, buildingId, apartmentId) {
        return `companies/${companyId}/buildings/${buildingId}/apartments/${apartmentId}`;
    }
    resolveApartmentStorageContext(apartmentId, data) {
        const buildingId = typeof data.buildingId === 'string' ? data.buildingId.trim() : '';
        const companyId = typeof data.companyId === 'string' && data.companyId.trim()
            ? data.companyId.trim()
            : Array.isArray(data.companyIds)
                ? data.companyIds.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
                : '';
        if (!companyId || !buildingId) {
            return null;
        }
        return {
            companyId,
            buildingId,
            path: this.getApartmentStorageFolderPath(companyId, buildingId, typeof data.readableId === 'string' && data.readableId.trim() ? data.readableId.trim() : apartmentId),
        };
    }
    async markStorageFolders(ref, folderPaths, entityLabel) {
        try {
            await this.firebaseAdminService.createStorageFolders(folderPaths);
            await ref.set({
                storageFoldersStatus: 'ready',
                storageFoldersError: firestore_1.FieldValue.delete(),
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Failed to create ${entityLabel} storage folders:`, message);
            await ref.set({
                storageFoldersStatus: 'pending',
                storageFoldersError: message,
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role) {
            throw new common_1.UnauthorizedException('Authentication required');
        }
    }
    isStaff(user) {
        return (0, role_constants_1.isStaffRole)(user.role);
    }
    async getAccessibleApartmentIds(user) {
        const apartmentIds = new Set();
        const addApartmentId = (value) => {
            if (typeof value === 'string' && value.trim()) {
                apartmentIds.add(value.trim());
            }
        };
        addApartmentId(user.apartmentId);
        const userSnap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};
        addApartmentId(userData.apartmentId);
        if (Array.isArray(userData.apartmentIds)) {
            for (const apartmentId of userData.apartmentIds) {
                addApartmentId(apartmentId);
            }
        }
        const normalizedEmail = (0, invitation_token_1.normalizeEmail)((typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '');
        if (normalizedEmail) {
            const [residentSnap, ownerSnap] = await Promise.all([
                this.firebaseAdminService.firestore.collection('apartments').where('residentId', '==', user.uid).get(),
                this.firebaseAdminService.firestore.collection('apartments').where('ownerEmail', '==', normalizedEmail).get(),
            ]);
            for (const doc of residentSnap.docs) {
                apartmentIds.add(doc.id);
            }
            for (const doc of ownerSnap.docs) {
                const apartment = doc.data();
                if (apartment.ownerActivated === true) {
                    apartmentIds.add(doc.id);
                }
            }
        }
        const tenantSnap = await this.firebaseAdminService.firestore.collection('apartments').get();
        for (const doc of tenantSnap.docs) {
            const apartment = doc.data();
            const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
            const isTenant = tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                return typeof tenant.userId === 'string'
                    && tenant.userId === user.uid;
            });
            if (isTenant) {
                apartmentIds.add(doc.id);
            }
        }
        const candidateIds = Array.from(apartmentIds);
        if (candidateIds.length === 0)
            return [];
        const refs = candidateIds.map((id) => this.firebaseAdminService.firestore.collection('apartments').doc(id));
        const snaps = await this.firebaseAdminService.firestore.getAll(...refs);
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        return snaps
            .filter((snap) => snap.exists)
            .filter((snap) => {
            const apartment = snap.data();
            const residentId = typeof apartment.residentId === 'string' ? apartment.residentId : '';
            const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
            const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
            const isResident = residentId === user.uid;
            const isOwner = apartment.ownerActivated === true &&
                ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail));
            const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
            const isTenant = tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                return typeof tenant.userId === 'string'
                    && tenant.userId === user.uid;
            });
            return isResident || isOwner || isTenant;
        })
            .map((snap) => snap.id);
    }
    canManageTenants(user, apartmentId, apartment) {
        if (this.isStaff(user)) {
            const companyIds = Array.isArray(apartment.companyIds)
                ? apartment.companyIds.filter((x) => typeof x === 'string')
                : [];
            const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : undefined;
            return !user.companyId || companyIds.includes(user.companyId) || companyId === user.companyId;
        }
        if (user.role !== 'Landlord') {
            return false;
        }
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
        return Boolean(normalizedUserEmail && ownerEmail && normalizedUserEmail === ownerEmail && apartment.ownerActivated === true);
    }
    hasApartmentOccupant(apartment) {
        const hasPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId.trim().length > 0;
        if (hasPrimaryResident)
            return true;
        const hasActivatedOwner = apartment.ownerActivated === true &&
            ((typeof apartment.ownerId === 'string' && apartment.ownerId.trim().length > 0) ||
                (typeof apartment.ownerEmail === 'string' && apartment.ownerEmail.trim().length > 0));
        if (hasActivatedOwner)
            return true;
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        return tenants.some((tenant) => {
            if (!tenant || typeof tenant !== 'object')
                return false;
            const record = tenant;
            const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
            if (['removed', 'deleted', 'revoked', 'inactive'].includes(status))
                return false;
            return ((typeof record.userId === 'string' && record.userId.trim().length > 0) ||
                (typeof record.email === 'string' && record.email.trim().length > 0));
        });
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
        const raw = payload.readingConfigOverride;
        if (!raw || typeof raw !== 'object') {
            return undefined;
        }
        const config = raw;
        const useBuildingDefaults = config.useBuildingDefaults !== false;
        const hotWaterMeters = Math.max(0, Math.trunc(Number(config.hotWaterMeters ?? 0) || 0));
        const coldWaterMeters = Math.max(0, Math.trunc(Number(config.coldWaterMeters ?? 0) || 0));
        return {
            useBuildingDefaults,
            hotWaterMeters: useBuildingDefaults ? 0 : hotWaterMeters,
            coldWaterMeters: useBuildingDefaults ? 0 : coldWaterMeters,
        };
    }
    buildEmptyWaterReadings(apartmentId, buildingId, building, readingConfigOverride) {
        const readingConfig = building.readingConfig && typeof building.readingConfig === 'object'
            ? building.readingConfig
            : {};
        const waterEnabled = Boolean(readingConfig.waterEnabled);
        if (!waterEnabled && readingConfigOverride?.useBuildingDefaults !== false) {
            return {};
        }
        const count = (value) => Math.max(0, Math.trunc(Number(value ?? 0) || 0));
        const hotWaterMeters = readingConfigOverride?.useBuildingDefaults === false
            ? readingConfigOverride.hotWaterMeters
            : count(readingConfig.hotWaterMetersPerResident);
        const coldWaterMeters = readingConfigOverride?.useBuildingDefaults === false
            ? readingConfigOverride.coldWaterMeters
            : count(readingConfig.coldWaterMetersPerResident);
        const waterReadings = {};
        if (hotWaterMeters > 0) {
            waterReadings.hotmeterwater = {
                meterId: (0, node_crypto_1.randomUUID)(),
                serialNumber: '',
                checkDueDate: '',
                history: [],
                apartmentId,
                buildingId,
            };
        }
        if (coldWaterMeters > 0) {
            waterReadings.coldmeterwater = {
                meterId: (0, node_crypto_1.randomUUID)(),
                serialNumber: '',
                checkDueDate: '',
                history: [],
                apartmentId,
                buildingId,
            };
        }
        return waterReadings;
    }
    buildReadableCode(value, length, fallback) {
        const normalized = String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, ' ')
            .trim();
        const words = normalized.split(/\s+/).filter(Boolean);
        const initials = words.map((word) => word[0]).join('');
        const merged = words.join('');
        const base = `${initials}${merged}`.replace(/[^A-Z0-9]/g, '') || fallback;
        return base.slice(0, length).padEnd(length, 'X');
    }
    buildRandomDigits(length) {
        const digits = (0, node_crypto_1.randomUUID)().replace(/\D/g, '').padEnd(length, '0');
        return digits.slice(0, length);
    }
    resolveFrontendUrl(request) {
        const origin = typeof request?.headers.origin === 'string' ? request.headers.origin : '';
        if (origin) {
            return origin.replace(/\/+$/, '');
        }
        const referer = typeof request?.headers.referer === 'string' ? request.headers.referer : '';
        if (referer) {
            try {
                const url = new URL(referer);
                return url.origin.replace(/\/+$/, '');
            }
            catch {
            }
        }
        return (process.env.FRONTEND_URL || 'https://domera.app').replace(/\/+$/, '');
    }
    buildInvitationLink(rawToken, request) {
        const frontendUrl = this.resolveFrontendUrl(request);
        return `${frontendUrl}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
    }
    buildInvitationActionHref(invitationLink) {
        try {
            const url = new URL(invitationLink);
            return `${url.pathname}${url.search}`;
        }
        catch {
            return invitationLink;
        }
    }
    resolveApartmentCompanyId(apartment) {
        if (typeof apartment.companyId === 'string' && apartment.companyId.trim()) {
            return apartment.companyId.trim();
        }
        if (Array.isArray(apartment.companyIds)) {
            return apartment.companyIds.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
        }
        return '';
    }
    async createApartmentInvitation(params) {
        const rawToken = (0, node_crypto_1.randomBytes)(32).toString('hex');
        const tokenHash = await (0, invitation_token_1.hashInvitationToken)(rawToken);
        const invitationRef = this.firebaseAdminService.firestore.collection('invitations').doc();
        const companyId = this.resolveApartmentCompanyId(params.apartment);
        await invitationRef.set({
            apartmentId: params.apartmentId,
            ...(companyId ? { companyId } : {}),
            email: params.email,
            status: 'pending',
            tokenHash,
            inviteType: params.inviteType,
            role: params.role,
            accountType: params.accountType,
            ...(params.firstName?.trim() ? { firstName: params.firstName.trim() } : {}),
            ...(params.lastName?.trim() ? { lastName: params.lastName.trim() } : {}),
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            invitedByUid: params.user.uid,
        });
        return {
            invitationId: invitationRef.id,
            invitationLink: this.buildInvitationLink(rawToken, params.request),
        };
    }
    async resolveOwnerInvitationContext(apartment) {
        const buildingId = this.firstString(apartment.buildingId);
        let building = {};
        if (buildingId) {
            const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
            building = buildingSnap.exists ? buildingSnap.data() : {};
        }
        return {
            companyName: this.firstString(apartment.managementCompanyName, apartment.companyName, building.managedBy?.companyName, building.managedBy?.name, 'Property Management'),
            buildingName: this.firstString(apartment.buildingAddress, building.address, building.street, building.location, apartment.buildingName, apartment.building, building.name, building.title),
            apartmentNumber: this.firstString(apartment.number, apartment.apartmentNumber, apartment.label, apartment.name),
        };
    }
    async createOwnerInvitationNotification(params) {
        if (!params.ownerId)
            return;
        try {
            const ref = this.firebaseAdminService.firestore
                .collection('users')
                .doc(params.ownerId)
                .collection('notifications')
                .doc();
            await ref.set({
                notificationId: ref.id,
                userId: params.ownerId,
                type: 'owner-invitation',
                channel: 'Invitation',
                title: 'Приглашение владельца',
                description: `Вас пригласили управлять квартирой ${params.apartmentNumber || ''}${params.buildingName ? ` (${params.buildingName})` : ''}.`,
                actionHref: this.buildInvitationActionHref(params.invitationLink),
                actionLabel: 'Принять приглашение',
                apartmentNumber: params.apartmentNumber || null,
                buildingName: params.buildingName || null,
                companyName: params.companyName || null,
                read: false,
                createdAt: new Date(),
            });
        }
        catch (error) {
            console.error('Failed to create owner invitation notification:', error);
        }
    }
    async createTenantInvitationNotification(params) {
        if (!params.tenantId)
            return;
        try {
            const ref = this.firebaseAdminService.firestore
                .collection('users')
                .doc(params.tenantId)
                .collection('notifications')
                .doc();
            await ref.set({
                notificationId: ref.id,
                userId: params.tenantId,
                type: 'tenant-invitation',
                channel: 'Invitation',
                title: 'Доступ к квартире',
                description: `Вам выдан доступ к квартире ${params.apartmentNumber || ''}${params.buildingName ? ` (${params.buildingName})` : ''}.`,
                actionHref: this.buildInvitationActionHref(params.invitationLink),
                actionLabel: 'Принять доступ',
                apartmentNumber: params.apartmentNumber || null,
                buildingName: params.buildingName || null,
                companyName: params.companyName || null,
                read: false,
                createdAt: new Date(),
            });
        }
        catch (error) {
            console.error('Failed to create tenant invitation notification:', error);
        }
    }
    buildApartmentNumberCode(apartmentNumber) {
        const normalized = String(apartmentNumber ?? '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '')
            .trim();
        return normalized || 'APT';
    }
    async generateApartmentReadableId(companyId, buildingId, apartmentNumber) {
        const db = this.firebaseAdminService.firestore;
        const [companySnap, buildingSnap] = await Promise.all([
            db.collection('companies').doc(companyId).get(),
            db.collection('buildings').doc(buildingId).get(),
        ]);
        const company = companySnap.exists ? companySnap.data() : {};
        const building = buildingSnap.exists ? buildingSnap.data() : {};
        const companyCode = this.buildReadableCode(company.companyName ?? company.name ?? companyId, 3, 'COM');
        const buildingCode = this.buildReadableCode(building.name ?? building.title ?? building.address ?? buildingId, 4, 'HOME');
        const apartmentCode = this.buildApartmentNumberCode(apartmentNumber);
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const readableId = `${companyCode}-${this.buildRandomDigits(4)}-${apartmentCode}-${buildingCode}-${this.buildRandomDigits(3)}`;
            const [existingDoc, existingReadableId] = await Promise.all([
                db.collection('apartments').doc(readableId).get(),
                db.collection('apartments').where('readableId', '==', readableId).limit(1).get(),
            ]);
            if (!existingDoc.exists && existingReadableId.empty) {
                return readableId;
            }
        }
        throw new common_1.BadRequestException('Failed to generate a unique apartment readable ID');
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
            if (!quoted && char === ',') {
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
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        if (!buildingId || !companyId) {
            throw new common_1.BadRequestException('Building ID and Company ID are required');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'apartments:import', user.uid), 5, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        if (user.companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const db = this.firebaseAdminService.firestore;
        const importBuildingSnap = await db.collection('buildings').doc(buildingId).get();
        if (!importBuildingSnap.exists)
            throw new common_1.NotFoundException('Building not found');
        const importBuildingData = importBuildingSnap.data();
        const importBuildingCompanyId = (typeof importBuildingData.companyId === 'string' ? importBuildingData.companyId : undefined) ??
            importBuildingData.managedBy?.companyId;
        if (!importBuildingCompanyId || importBuildingCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for building/company ownership');
        }
        const fileSize = file.size ?? file.buffer?.length ?? 0;
        if (!file.buffer || fileSize <= 0) {
            throw new common_1.BadRequestException('File is required');
        }
        if (fileSize > APARTMENT_IMPORT_MAX_BYTES) {
            throw new common_1.BadRequestException('Apartment import file is too large');
        }
        const rows = await this.parseImportRows(file);
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
        const results = {
            imported: 0,
            errors: [],
            skippedDuplicates: [],
            createdApartments: [],
        };
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
                const readableId = await this.generateApartmentReadableId(companyId, buildingId, apartmentNumber);
                const apartmentData = {
                    buildingId,
                    number: apartmentNumber,
                    companyIds: [companyId],
                    readableId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
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
                const apartmentRef = db.collection('apartments').doc(readableId);
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
                batch.set(apartmentRef, { ...apartmentData, waterReadings });
                importedApartmentNumbers.add(normalizedApartmentNumber);
                importedApartmentIds.push(apartmentRef.id);
                importedApartmentStorageFolders.push({ id: apartmentRef.id, readableId });
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
            await batch.commit();
            await db.collection('buildings').doc(buildingId).set({ apartmentIds: firestore_1.FieldValue.arrayUnion(...importedApartmentIds) }, { merge: true });
            await Promise.all(importedApartmentStorageFolders.map((apartment) => this.markStorageFolders(db.collection('apartments').doc(apartment.id), [
                ...this.getBuildingStorageFolders(companyId, buildingId),
                ...this.getApartmentStorageFolders(companyId, buildingId, apartment.readableId),
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
        return {
            id,
            ...data,
            createdAt,
        };
    }
    async list(request, user, query) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        const companyId = typeof query.companyId === 'string' ? query.companyId.trim() : '';
        const buildingId = typeof query.buildingId === 'string' ? query.buildingId.trim() : '';
        const residentId = typeof query.residentId === 'string' ? query.residentId.trim() : '';
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
            if (user.companyId && user.companyId !== companyId) {
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
            return { items: Array.from(merged.entries()).map(([id, data]) => this.mapApartmentDoc(id, data)) };
        }
        else {
            if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
                throw new common_1.ForbiddenException('Insufficient permissions');
            }
            snapshot = await db.collection('apartments').limit(200).get();
        }
        return {
            items: snapshot.docs.map((doc) => this.mapApartmentDoc(doc.id, doc.data())),
        };
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
        const companyIds = Array.isArray(data.companyIds)
            ? data.companyIds.filter((x) => typeof x === 'string')
            : [];
        const companyId = typeof data.companyId === 'string' ? data.companyId : undefined;
        if (this.isStaff(user)) {
            if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
                throw new common_1.ForbiddenException('Access denied for company');
            }
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
        return this.mapApartmentDoc(snap.id, data);
    }
    async create(request, user, payload) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const number = typeof payload.number === 'string' ? payload.number.trim() : '';
        const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId.trim() : '';
        const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
        if (!number || !buildingId || !companyId) {
            throw new common_1.BadRequestException('number, buildingId and companyId are required');
        }
        if (user.companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
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
            throw new common_1.BadRequestException('Квартира с таким номером уже существует в этом доме');
        }
        const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
        const readableId = await this.generateApartmentReadableId(companyId, buildingId, number);
        const ref = db.collection('apartments').doc(readableId);
        const buildingSnap = await db.collection('buildings').doc(buildingId).get();
        const building = buildingSnap.exists ? buildingSnap.data() : {};
        const waterReadings = this.buildEmptyWaterReadings(readableId, buildingId, building, readingConfigOverride);
        const data = {
            ...payload,
            number,
            buildingId,
            companyIds: [companyId],
            readableId,
            ...(readingConfigOverride ? { readingConfigOverride } : {}),
            ...(Object.keys(waterReadings).length > 0 ? { waterReadings } : {}),
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await ref.set(data);
        await this.markStorageFolders(ref, [
            ...this.getBuildingStorageFolders(companyId, buildingId),
            ...this.getApartmentStorageFolders(companyId, buildingId, readableId),
        ], 'apartment');
        await db.collection('buildings').doc(buildingId).set({ apartmentIds: firestore_1.FieldValue.arrayUnion(ref.id) }, { merge: true });
        return { id: ref.id, ...data };
    }
    async update(request, user, apartmentId, payload) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!apartmentId?.trim())
            throw new common_1.BadRequestException('apartmentId is required');
        await this.enforceRateLimit(request, 'apartments:update', `${user.uid}:${apartmentId}`, 40);
        const db = this.firebaseAdminService.firestore;
        const ref = db.collection('apartments').doc(apartmentId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const current = snap.data();
        const companyIds = Array.isArray(current.companyIds)
            ? current.companyIds.filter((x) => typeof x === 'string')
            : [];
        const companyId = typeof current.companyId === 'string' ? current.companyId : undefined;
        if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
        const updatedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : companyId;
        const updatedBuildingId = typeof payload.buildingId === 'string'
            ? payload.buildingId
            : (typeof current.buildingId === 'string' ? current.buildingId : undefined);
        const updatedNumber = typeof payload.number === 'string'
            ? payload.number
            : (typeof current.number === 'string' ? current.number : undefined);
        const shouldRegenerateReadableId = Boolean((payload.companyId && updatedCompanyId !== companyId) ||
            (payload.buildingId && updatedBuildingId !== current.buildingId) ||
            (payload.number && updatedNumber !== current.number));
        const readableId = shouldRegenerateReadableId && updatedCompanyId && updatedBuildingId && updatedNumber
            ? await this.generateApartmentReadableId(updatedCompanyId, updatedBuildingId, updatedNumber)
            : current.readableId;
        await ref.set({
            ...payload,
            ...(typeof readableId === 'string' && readableId.trim() ? { readableId } : {}),
            ...(readingConfigOverride ? { readingConfigOverride } : {}),
            updatedAt: new Date(),
        }, { merge: true });
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
        const companyIds = Array.isArray(data.companyIds)
            ? data.companyIds.filter((value) => typeof value === 'string')
            : [];
        const companyId = typeof data.companyId === 'string' ? data.companyId : undefined;
        if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const context = this.resolveApartmentStorageContext(apartmentId, data);
        if (!context) {
            return { path: null, fileCount: 0, hasUserFiles: false };
        }
        return this.firebaseAdminService.getStorageFolderSummary(context.path);
    }
    async remove(request, user, apartmentId) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
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
        if (this.hasApartmentOccupant(data)) {
            throw new common_1.BadRequestException('Нельзя удалить квартиру: сначала отвяжите жильцов');
        }
        const context = this.resolveApartmentStorageContext(apartmentId, data);
        if (context) {
            await this.firebaseAdminService.deleteStorageFolder(context.path);
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
            updatedAt: new Date(),
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
        const { invitationLink, invitationId } = await this.createApartmentInvitation({
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
        await apartmentRef.set({
            ownerEmail: email,
            ownerId: ownerId ?? null,
            owner: fullName,
            ownerFirstName: firstName || null,
            ownerLastName: lastName || null,
            ownerContractNumber: contractNumber || null,
            ownerInvitedAt: new Date(),
            ownerInvitationId: invitationId,
            ownerActivated: false,
            updatedAt: new Date(),
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
            console.error('Failed to sync owner apartment profile:', error);
        }
        const ownerInvitationContext = await this.resolveOwnerInvitationContext(apartment);
        await this.createOwnerInvitationNotification({
            ownerId,
            invitationLink,
            companyName: ownerInvitationContext.companyName,
            buildingName: ownerInvitationContext.buildingName,
            apartmentNumber: ownerInvitationContext.apartmentNumber,
        });
        try {
            await this.emailService.sendOwnerInvitation({
                to: email,
                companyName: ownerInvitationContext.companyName,
                buildingName: ownerInvitationContext.buildingName,
                apartmentNumber: ownerInvitationContext.apartmentNumber,
                invitationLink,
                language: 'lv',
            });
        }
        catch (error) {
            console.error('Failed to send owner invitation email:', error);
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
            updatedAt: new Date(),
        }, { merge: true });
        if (ownerId) {
            await db.collection('users').doc(ownerId).set({
                apartmentIds: firestore_1.FieldValue.arrayRemove(apartmentId),
                apartmentId: null,
                updatedAt: new Date().toISOString(),
            }, { merge: true }).catch((error) => {
                console.error(`Failed to detach apartment from owner ${ownerId}:`, error);
            });
        }
        this.auditLogService.write({
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
            const created = await this.firebaseAdminService.auth.createUser({
                email,
                password: (0, node_crypto_1.randomBytes)(18).toString('base64url'),
            });
            authUserId = created.uid;
            const tenantUserCompanyId = (Array.isArray(apartment.companyIds)
                ? apartment.companyIds.find((value) => typeof value === 'string' && value.trim().length > 0)
                : undefined) ??
                (typeof apartment.companyId === 'string' ? apartment.companyId : undefined);
            await db.collection('users').doc(authUserId).set({
                uid: authUserId,
                email,
                role: 'Resident',
                accountType: 'Resident',
                ...(tenantUserCompanyId ? { companyId: tenantUserCompanyId } : {}),
                createdAt: new Date().toISOString(),
            }, { merge: true });
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
            userId: authUserId,
            email,
            name: fullName,
            permissions,
            apartmentId,
            status: 'Pending',
            invitedAt: new Date(),
        };
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
        const nextTenants = [
            ...tenants.filter((tenant) => {
                const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
                const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
                return tenantUserId !== authUserId && tenantEmail !== email;
            }),
            tenantRecord,
        ];
        await apartmentRef.set({ tenants: nextTenants, updatedAt: new Date() }, { merge: true });
        let invitationLink = '';
        let invitationId = '';
        try {
            const result = await this.createApartmentInvitation({
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
            await this.createTenantInvitationNotification({
                tenantId: authUserId,
                invitationLink,
                companyName,
                buildingName,
                apartmentNumber,
            });
            await this.emailService.sendTenantInvitation({
                to: email,
                companyName,
                buildingName,
                apartmentNumber,
                invitationLink,
                senderName,
                language: 'lv',
            });
        }
        catch (error) {
            console.error('Failed to send tenant invitation email:', error);
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
            updatedAt: new Date(),
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
            console.error(`Failed to detach apartment from user ${targetUserId}:`, error);
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
        await apartmentRef.set({ tenants: nextTenants, updatedAt: new Date() }, { merge: true });
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
        if (!this.canManageTenants(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const currentOwnerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.toLowerCase() : '';
        if (currentOwnerEmail !== ownerEmail.toLowerCase()) {
            throw new common_1.NotFoundException('Owner not found in this apartment');
        }
        const { invitationLink, invitationId } = await this.createApartmentInvitation({
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
        const ownerInvitationContext = await this.resolveOwnerInvitationContext(apartment);
        await this.createOwnerInvitationNotification({
            ownerId,
            invitationLink,
            companyName: ownerInvitationContext.companyName,
            buildingName: ownerInvitationContext.buildingName,
            apartmentNumber: ownerInvitationContext.apartmentNumber,
        });
        try {
            await this.emailService.sendOwnerInvitation({
                to: ownerEmail,
                companyName: ownerInvitationContext.companyName,
                buildingName: ownerInvitationContext.buildingName,
                apartmentNumber: ownerInvitationContext.apartmentNumber,
                invitationLink,
                language: 'lv',
            });
        }
        catch (error) {
            console.error('Failed to send owner invitation email:', error);
        }
        await apartmentRef.set({
            ownerInvitedAt: new Date(),
            ownerInvitationId: invitationId,
            updatedAt: new Date(),
        }, { merge: true });
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
        try {
            const { invitationLink, invitationId } = await this.createApartmentInvitation({
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
                invitationLink,
                senderName,
                language: 'lv',
            });
        }
        catch (error) {
            console.error('Failed to send tenant invitation email:', error);
        }
        const updatedTenants = tenants.map((t) => typeof t.email === 'string' && t.email.toLowerCase() === tenantEmail.toLowerCase()
            ? { ...t, invitedAt: new Date() }
            : t);
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
        const companyIds = Array.isArray(apartment.companyIds)
            ? apartment.companyIds.filter((x) => typeof x === 'string')
            : [];
        const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : undefined;
        if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const logs = await db
            .collection('audit_logs')
            .where('apartmentId', '==', apartmentId)
            .get();
        const sortedDocs = logs.docs.sort((a, b) => {
            const aTime = a.data().createdAt instanceof Date ? a.data().createdAt.getTime() : 0;
            const bTime = b.data().createdAt instanceof Date ? b.data().createdAt.getTime() : 0;
            return bTime - aTime;
        }).slice(0, limit);
        return {
            items: sortedDocs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt instanceof Date
                    ? doc.data().createdAt.toISOString()
                    : typeof doc.data().createdAt === 'string'
                        ? doc.data().createdAt
                        : new Date().toISOString(),
            })),
        };
    }
    async migrateApartmentReadableIds() {
        const db = this.firebaseAdminService.firestore;
        const snapshot = await db.collection('apartments').get();
        let updated = 0;
        const batch = db.batch();
        for (const doc of snapshot.docs) {
            const apartment = doc.data();
            if (!apartment.readableId) {
                const companyId = typeof apartment.companyId === 'string'
                    ? apartment.companyId
                    : (Array.isArray(apartment.companyIds) && apartment.companyIds.length > 0
                        ? apartment.companyIds.find((value) => typeof value === 'string' && value.trim().length > 0) ?? ''
                        : '');
                const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
                if (!buildingId) {
                    continue;
                }
                const number = typeof apartment.number === 'string' ? apartment.number : doc.id;
                const readableId = await this.generateApartmentReadableId(companyId, buildingId, number);
                batch.set(doc.ref, { readableId, updatedAt: new Date() }, { merge: true });
                updated++;
            }
        }
        if (updated > 0) {
            await batch.commit();
        }
        return { updated, total: snapshot.size };
    }
};
exports.ApartmentsService = ApartmentsService;
exports.ApartmentsService = ApartmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        email_service_1.EmailService])
], ApartmentsService);

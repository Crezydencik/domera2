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
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const XLSX = require("xlsx");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
let ApartmentsService = class ApartmentsService {
    constructor(firebaseAdminService, rateLimitService, auditLogService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed) {
            throw new common_1.BadRequestException('Too many requests');
        }
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
            if (raw < 20000 || raw > 70000)
                return null;
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
            return n.startsWith('data') || n.includes('date');
        };
        const isLikelyDateColumn = (header) => {
            const n = this.normalizeHeader(header);
            return isDateHeader(header) || n === '' || n.startsWith('__empty');
        };
        const findNearestPeriod = (index) => {
            let best = null;
            for (let j = 0; j < entries.length; j++) {
                if (j === index)
                    continue;
                const [dateColName, dateValue] = entries[j];
                if (!isLikelyDateColumn(dateColName))
                    continue;
                const parsed = this.parsePeriodFromDateCell(dateValue);
                if (!parsed)
                    continue;
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
    async importFromSpreadsheet(input) {
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
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
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
                const apartmentData = {
                    buildingId,
                    number: apartmentNumber,
                    companyIds: [companyId],
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
                const apartmentRef = db.collection('apartments').doc();
                const waterReadings = {};
                const hotWaterCheckDueDate = this.findDueDateFromRow(row, 'hot');
                const coldWaterCheckDueDate = this.findDueDateFromRow(row, 'cold');
                if (hotWaterMeterNumber) {
                    const hotWaterMeterId = (0, node_crypto_1.randomUUID)();
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
                    const coldWaterMeterId = (0, node_crypto_1.randomUUID)();
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
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
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
        if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
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
        const ref = db.collection('apartments').doc();
        const data = {
            ...payload,
            number,
            buildingId,
            companyIds: [companyId],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await ref.set(data);
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
        await ref.set({ ...payload, updatedAt: new Date() }, { merge: true });
        return { success: true };
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
        if (data.residentId) {
            throw new common_1.BadRequestException('Нельзя удалить квартиру: сначала отвяжите жильца');
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
        await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).set({
            residentId: null,
            tenants: [],
            updatedAt: new Date(),
        }, { merge: true });
        return { success: true };
    }
    async addOrInviteTenant(request, user, apartmentId, emailInput) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
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
        let authUserId = '';
        try {
            const existing = await this.firebaseAdminService.auth.getUserByEmail(email);
            authUserId = existing.uid;
        }
        catch {
            const created = await this.firebaseAdminService.auth.createUser({
                email,
                password: Math.random().toString(36).slice(-12),
            });
            authUserId = created.uid;
            await db.collection('users').doc(authUserId).set({
                uid: authUserId,
                email,
                role: 'Resident',
                createdAt: new Date().toISOString(),
            }, { merge: true });
        }
        const apartment = apartmentSnap.data();
        const tenants = Array.isArray(apartment.tenants)
            ? apartment.tenants
            : [];
        if (tenants.some((t) => t.userId === authUserId)) {
            throw new common_1.BadRequestException('Этот пользователь уже имеет доступ');
        }
        const nextTenants = [
            ...tenants,
            {
                userId: authUserId,
                email,
                name: email,
                permissions: ['submitMeter'],
                invitedAt: new Date(),
            },
        ];
        await apartmentRef.set({ tenants: nextTenants, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
    async removeTenant(request, user, apartmentId, userId) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
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
        const tenants = Array.isArray(apartment.tenants)
            ? apartment.tenants
            : [];
        const next = tenants.filter((t) => t.userId !== userId);
        await apartmentRef.set({ tenants: next, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
};
exports.ApartmentsService = ApartmentsService;
exports.ApartmentsService = ApartmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService])
], ApartmentsService);

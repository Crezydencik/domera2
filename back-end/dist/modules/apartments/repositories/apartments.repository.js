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
exports.ApartmentsRepository = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let ApartmentsRepository = class ApartmentsRepository {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    get collection() {
        return this.firebaseAdminService.firestore.collection('apartments');
    }
    createRef() {
        return this.collection.doc();
    }
    doc(apartmentId) {
        return this.collection.doc(apartmentId);
    }
    async findById(apartmentId) {
        const ref = this.doc(apartmentId);
        const snap = await ref.get();
        if (!snap.exists)
            return null;
        return {
            ref,
            data: snap.data(),
        };
    }
    async commitInChunks(operations, chunkSize = 450) {
        const db = this.firebaseAdminService.firestore;
        for (let index = 0; index < operations.length; index += chunkSize) {
            const batch = db.batch();
            const chunk = operations.slice(index, index + chunkSize);
            for (const operation of chunk) {
                operation(batch);
            }
            await batch.commit();
        }
    }
};
exports.ApartmentsRepository = ApartmentsRepository;
exports.ApartmentsRepository = ApartmentsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], ApartmentsRepository);

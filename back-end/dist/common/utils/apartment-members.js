"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMBER_KEYS_VERSION = void 0;
exports.memberKeysForUser = memberKeysForUser;
exports.computeApartmentMemberKeys = computeApartmentMemberKeys;
exports.memberKeysQueryEnabled = memberKeysQueryEnabled;
exports.refreshApartmentMemberKeys = refreshApartmentMemberKeys;
exports.findCandidateApartments = findCandidateApartments;
const invitation_token_1 = require("./invitation-token");
exports.MEMBER_KEYS_VERSION = 1;
const str = (value) => (typeof value === 'string' ? value.trim() : '');
function memberKeysForUser(uid, email) {
    const keys = [];
    if (uid?.trim())
        keys.push(`uid:${uid.trim()}`);
    const normalized = email ? (0, invitation_token_1.normalizeEmail)(email) : '';
    if (normalized)
        keys.push(`email:${normalized}`);
    return keys;
}
function computeApartmentMemberKeys(apartment) {
    const keys = new Set();
    const addUid = (value) => {
        const uid = str(value);
        if (uid)
            keys.add(`uid:${uid}`);
    };
    const addEmail = (value) => {
        const email = typeof value === 'string' ? (0, invitation_token_1.normalizeEmail)(value) : '';
        if (email)
            keys.add(`email:${email}`);
    };
    addUid(apartment.ownerId);
    addEmail(apartment.ownerEmail);
    addUid(apartment.residentId);
    addEmail(apartment.residentEmail);
    if (Array.isArray(apartment.formerOwnerIds))
        apartment.formerOwnerIds.forEach(addUid);
    if (Array.isArray(apartment.formerOwnerEmails))
        apartment.formerOwnerEmails.forEach(addEmail);
    if (Array.isArray(apartment.tenants)) {
        for (const tenant of apartment.tenants) {
            if (!tenant || typeof tenant !== 'object')
                continue;
            addUid(tenant.userId);
            addEmail(tenant.email);
        }
    }
    return Array.from(keys).sort();
}
function memberKeysQueryEnabled() {
    return process.env.APARTMENT_MEMBER_KEYS === 'true';
}
async function refreshApartmentMemberKeys(db, apartmentId) {
    const id = str(apartmentId);
    if (!id)
        return;
    const ref = db.collection('apartments').doc(id);
    const snap = await ref.get();
    if (!snap.exists)
        return;
    const data = snap.data();
    const next = computeApartmentMemberKeys(data);
    const current = Array.isArray(data.memberKeys) ? data.memberKeys.map(String) : null;
    if (current && data.memberKeysVersion === exports.MEMBER_KEYS_VERSION && current.join('\n') === next.join('\n'))
        return;
    await ref.set({ memberKeys: next, memberKeysVersion: exports.MEMBER_KEYS_VERSION }, { merge: true });
}
async function findCandidateApartments(db, user) {
    const apartments = new Map();
    const pointerIds = new Set();
    const addPointer = (value) => {
        const id = str(value);
        if (id)
            pointerIds.add(id);
    };
    addPointer(user.apartmentId);
    const userSnap = await db.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    addPointer(userData.apartmentId);
    if (Array.isArray(userData.apartmentIds))
        userData.apartmentIds.forEach(addPointer);
    const email = (0, invitation_token_1.normalizeEmail)(str(user.email) || str(userData.email));
    const addDocs = (snap) => {
        for (const doc of snap?.docs ?? [])
            apartments.set(doc.id, doc.data());
    };
    const collection = db.collection('apartments');
    if (memberKeysQueryEnabled()) {
        addDocs(await collection.where('memberKeys', 'array-contains-any', memberKeysForUser(user.uid, email)).get());
    }
    else {
        const snaps = await Promise.all([
            collection.where('residentId', '==', user.uid).get(),
            collection.where('ownerId', '==', user.uid).get(),
            collection.where('formerOwnerIds', 'array-contains', user.uid).get(),
            email ? collection.where('residentEmail', '==', email).get() : Promise.resolve(null),
            email ? collection.where('ownerEmail', '==', email).get() : Promise.resolve(null),
            email ? collection.where('formerOwnerEmails', 'array-contains', email).get() : Promise.resolve(null),
        ]);
        snaps.forEach(addDocs);
    }
    const missing = Array.from(pointerIds).filter((id) => !apartments.has(id));
    if (missing.length > 0) {
        const snaps = await db.getAll(...missing.map((id) => collection.doc(id)));
        for (const snap of snaps) {
            if (snap.exists)
                apartments.set(snap.id, snap.data());
        }
    }
    return apartments;
}

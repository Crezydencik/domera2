export declare const MEMBER_KEYS_VERSION = 1;
type Data = Record<string, unknown>;
export declare function memberKeysForUser(uid: string | undefined, email: string | undefined | null): string[];
export declare function computeApartmentMemberKeys(apartment: Data): string[];
export declare function memberKeysQueryEnabled(): boolean;
export declare function refreshApartmentMemberKeys(db: FirebaseFirestore.Firestore, apartmentId: string | undefined | null): Promise<void>;
export declare function findCandidateApartments(db: FirebaseFirestore.Firestore, user: {
    uid: string;
    email?: string | null;
    apartmentId?: string;
}): Promise<Map<string, Data>>;
export {};

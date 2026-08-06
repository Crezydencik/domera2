export type AuthSessionCookie = {
    cookie: string;
    maxAgeSeconds: number;
    role?: string;
    accountType?: string;
    companyId?: string;
    apartmentId?: string;
};
export type AuthSessionResult = AuthSessionCookie & {
    userId: string;
    email?: string;
};

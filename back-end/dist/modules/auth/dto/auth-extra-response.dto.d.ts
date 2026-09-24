export declare class RegisterEmailCodeRequestResponseDto {
    success: boolean;
    expiresInSeconds: number;
}
export declare class RegisterEmailCodeVerifyResponseDto {
    success: boolean;
    verificationToken: string;
    expiresInSeconds: number;
}
export declare class SendPasswordResetResponseDto {
    success: boolean;
    message: string;
}

export type NotificationLanguage = 'ru' | 'lv' | 'en';
export type NotificationSettings = {
    general: boolean;
    meterReminder: boolean;
    paymentReminder: boolean;
    language: NotificationLanguage;
};
export declare const defaultNotificationSettings: NotificationSettings;

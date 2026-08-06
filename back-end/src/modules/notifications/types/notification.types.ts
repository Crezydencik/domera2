export type NotificationLanguage = 'ru' | 'lv' | 'en';

export type NotificationSettings = {
  general: boolean;
  meterReminder: boolean;
  paymentReminder: boolean;
  language: NotificationLanguage;
};

export const defaultNotificationSettings: NotificationSettings = {
  general: true,
  meterReminder: true,
  paymentReminder: true,
  language: 'ru',
};

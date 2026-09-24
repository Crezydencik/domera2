"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailType = void 0;
var EmailType;
(function (EmailType) {
    EmailType["REGISTRATION_CODE"] = "registration-code";
    EmailType["PASSWORD_RESET"] = "password-reset";
    EmailType["OWNER_INVITATION"] = "owner-invitation";
    EmailType["TENANT_INVITATION"] = "tenant-invitation";
    EmailType["TENANT_INVITED_BY_OWNER"] = "tenant-invited-by-owner";
    EmailType["INVOICE_GENERATED"] = "invoice-generated";
    EmailType["METER_READING_REMINDER"] = "meter-reading-reminder";
    EmailType["NOTIFICATION"] = "notification";
})(EmailType || (exports.EmailType = EmailType = {}));

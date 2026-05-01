# Email Module Structure

## Overview
Created a comprehensive, production-ready email module for the Domera backend with full multilingual support (English, Russian, Latvian).

## Directory Structure

```
back-end/src/modules/emails/
├── templates/
│   ├── registration-code.template.ts       # Registration verification codes
│   ├── password-reset.template.ts          # Password reset links
│   ├── owner-invitation.template.ts        # Invitations for property owners
│   ├── tenant-invitation.template.ts       # Invitations for tenants/residents
│   ├── tenant-invited-by-owner.template.ts # Notifications when owner invites tenant
│   ├── invoice-generated.template.ts       # Invoice notifications
│   ├── meter-reading-reminder.template.ts  # Meter reading submission reminders
│   ├── notification.template.ts            # Generic notifications
│   └── index.ts                            # Template exports
├── dto/
│   └── send-email.dto.ts                   # Data transfer objects for all email types
├── email.types.ts                          # TypeScript types and enums
├── email.service.ts                        # Email sending logic
├── email.controller.ts                     # REST API endpoints
├── email.module.ts                         # NestJS module definition
├── index.ts                                # Public module exports
└── README.md                               # Complete documentation
```

## Features

### ✅ Email Templates (8 Types)
1. **Registration Code** - Verification code for user registration
2. **Password Reset** - Password reset link
3. **Owner Invitation** - Invite property owners
4. **Tenant Invitation** - Invite tenants/residents
5. **Tenant Invited by Owner** - Notification when owner invites tenant
6. **Invoice Generated** - Invoice notifications
7. **Meter Reading Reminder** - Submission reminders
8. **Generic Notification** - Custom notifications

### ✅ Multilingual Support
- **English** (en)
- **Russian** (ru)
- **Latvian** (lv)

### ✅ Service Methods
- `sendRegistrationCode()`
- `sendPasswordReset()`
- `sendOwnerInvitation()`
- `sendTenantInvitation()`
- `sendTenantInvitedByOwner()`
- `sendInvoiceGenerated()`
- `sendMeterReadingReminder()`
- `sendNotification()`

### ✅ REST API Endpoints
All endpoints are POST requests to `/api/emails/`:
- `/registration-code`
- `/password-reset`
- `/owner-invitation`
- `/tenant-invitation`
- `/tenant-invited-by-owner`
- `/invoice-generated`
- `/meter-reading-reminder`
- `/notification`

## Integration

The module is already integrated into the main app:

### In `app.module.ts`:
```typescript
import { EmailModule } from './modules/emails/email.module';

@Module({
  imports: [
    // ... other modules
    EmailModule,
  ],
})
export class AppModule {}
```

### Usage in Other Services:
```typescript
import { EmailService } from './modules/emails';

@Injectable()
export class SomeService {
  constructor(private emailService: EmailService) {}

  async doSomething() {
    await this.emailService.sendRegistrationCode({
      to: 'user@example.com',
      code: '123456',
      language: 'en'
    });
  }
}
```

## Environment Configuration

Required environment variables:
```env
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=noreply@yourdomain.com
```

## Key Characteristics

- **Type-Safe**: Full TypeScript support with DTOs and validation
- **Responsive Design**: HTML templates work on all devices
- **Consistent Styling**: Unified color scheme and layout
- **Error Handling**: Comprehensive error messages and logging
- **Extensible**: Easy to add new email types
- **Production-Ready**: Follows NestJS best practices

## Next Steps

1. Set environment variables for Resend
2. Replace `sendRegistrationCode()` calls in auth service with the new email service
3. Integrate email sending into other modules (invitations, invoices, etc.)
4. Test templates by sending emails to test accounts
5. Monitor email delivery in Resend dashboard

## Files Created

- ✅ 8 template files with 3 languages each
- ✅ 1 comprehensive DTO file
- ✅ 1 email service
- ✅ 1 email controller
- ✅ 1 email module
- ✅ 1 types file
- ✅ Complete README documentation
- ✅ Updated app.module.ts

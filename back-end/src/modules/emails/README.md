# Email Module

Comprehensive email service with multilingual support (English, Russian, Latvian) for the Domera application.

## Features

- 🌍 **Multilingual Support**: All templates available in English, Russian, and Latvian
- 📧 **Pre-built Templates**: Registration, password reset, invitations, invoices, meter readings, and notifications
- 🔧 **Easy Integration**: Simple service methods for each email type
- 📝 **Type-Safe DTOs**: Full TypeScript support with validation
- 🎨 **Professional HTML**: Responsive email templates with consistent styling

## Supported Email Types

### 1. Registration Code
- **Purpose**: Send verification code for user registration
- **Method**: `sendRegistrationCode()`
- **Languages**: EN, RU, LV

### 2. Password Reset
- **Purpose**: Send password reset link
- **Method**: `sendPasswordReset()`
- **Languages**: EN, RU, LV

### 3. Owner Invitation
- **Purpose**: Invite property owners to the platform
- **Method**: `sendOwnerInvitation()`
- **Parameters**: Company name, sender name (optional)
- **Languages**: EN, RU, LV

### 4. Tenant Invitation
- **Purpose**: Invite tenants/residents to the platform
- **Method**: `sendTenantInvitation()`
- **Parameters**: Company name, building name, apartment number
- **Languages**: EN, RU, LV

### 5. Tenant Invited by Owner
- **Purpose**: Notify tenant when owner sends an invitation
- **Method**: `sendTenantInvitedByOwner()`
- **Parameters**: Owner name, tenant name (optional), apartment details
- **Languages**: EN, RU, LV

### 6. Invoice Generated
- **Purpose**: Notify about new invoice
- **Method**: `sendInvoiceGenerated()`
- **Parameters**: Invoice number, amount, due date, apartment info
- **Languages**: EN, RU, LV

### 7. Meter Reading Reminder
- **Purpose**: Remind residents to submit meter readings
- **Method**: `sendMeterReadingReminder()`
- **Parameters**: List of meters, submission deadline
- **Languages**: EN, RU, LV

### 8. Generic Notification
- **Purpose**: Send custom notifications
- **Method**: `sendNotification()`
- **Parameters**: Title, message, optional action link
- **Languages**: EN, RU, LV

## Usage Examples

### Setup

First, import the `EmailModule` in your app module:

```typescript
import { EmailModule } from './modules/emails';

@Module({
  imports: [
    ConfigModule.forRoot(),
    EmailModule,
    // ... other modules
  ],
})
export class AppModule {}
```

### Sending Emails

#### Registration Code

```typescript
import { EmailService } from './modules/emails';

export class AuthService {
  constructor(private emailService: EmailService) {}

  async sendRegistrationCode(email: string, code: string) {
    await this.emailService.sendRegistrationCode({
      to: email,
      code: code,
      language: 'en', // optional: 'en', 'ru', 'lv'
    });
  }
}
```

#### Password Reset

```typescript
async sendPasswordReset(email: string, resetLink: string) {
  await this.emailService.sendPasswordReset({
    to: email,
    resetLink: resetLink,
    language: 'ru', // optional
  });
}
```

#### Owner Invitation

```typescript
async inviteOwner(email: string, companyName: string) {
  await this.emailService.sendOwnerInvitation({
    to: email,
    companyName: companyName,
    invitationLink: 'https://app.domera.com/invite/abc123',
    senderName: 'John Manager', // optional
    language: 'en',
  });
}
```

#### Tenant Invitation

```typescript
async inviteTenant(email: string, buildingName: string) {
  await this.emailService.sendTenantInvitation({
    to: email,
    companyName: 'Property Management Co',
    buildingName: buildingName,
    apartmentNumber: '42A',
    invitationLink: 'https://app.domera.com/invite/xyz789',
    senderName: 'Maria Admin',
    language: 'lv',
  });
}
```

#### Tenant Invited by Owner

```typescript
async notifyTenantInvitation(email: string, ownerName: string) {
  await this.emailService.sendTenantInvitedByOwner({
    to: email,
    ownerName: ownerName,
    tenantName: 'Jane Doe',
    buildingName: 'Sky Tower',
    apartmentNumber: '42A',
    invitationLink: 'https://app.domera.com/invite/owner123',
    language: 'en',
  });
}
```

#### Invoice Generated

```typescript
async sendInvoiceNotification(email: string, invoiceData: any) {
  await this.emailService.sendInvoiceGenerated({
    to: email,
    invoiceNumber: 'INV-2024-001',
    amount: '€ 150.00',
    dueDate: '2024-12-31',
    invoiceLink: 'https://app.domera.com/invoices/inv-001',
    tenantName: 'John Resident',
    apartmentNumber: '42A',
    buildingName: 'Sky Tower',
    language: 'ru',
  });
}
```

#### Meter Reading Reminder

```typescript
async sendMeterReminder(email: string) {
  await this.emailService.sendMeterReadingReminder({
    to: email,
    submissionLink: 'https://app.domera.com/meter-readings',
    tenantName: 'John Resident',
    apartmentNumber: '42A',
    buildingName: 'Sky Tower',
    meters: [
      { name: 'Water', lastReading: '1234.5', unit: 'm³' },
      { name: 'Electricity', lastReading: '5678.9', unit: 'kWh' },
      { name: 'Gas', lastReading: '987.6', unit: 'm³' },
    ],
    deadline: '2024-12-15',
    language: 'en',
  });
}
```

#### Generic Notification

```typescript
async sendCustomNotification(email: string) {
  await this.emailService.sendNotification({
    to: email,
    title: 'Maintenance Scheduled',
    message: 'There will be maintenance in your building next Saturday from 9 AM to 12 PM.',
    actionLabel: 'View Details',
    actionLink: 'https://app.domera.com/maintenance/123',
    footer: 'For questions, contact the building management.',
    language: 'en',
  });
}
```

## Environment Variables

Ensure the following environment variables are set:

```env
# Resend Email Service
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=noreply@yourdomain.com
```

## API Endpoints

The email module provides REST endpoints for sending emails:

- `POST /api/emails/registration-code` - Send registration code
- `POST /api/emails/password-reset` - Send password reset
- `POST /api/emails/owner-invitation` - Send owner invitation
- `POST /api/emails/tenant-invitation` - Send tenant invitation
- `POST /api/emails/tenant-invited-by-owner` - Send tenant invited by owner
- `POST /api/emails/invoice-generated` - Send invoice notification
- `POST /api/emails/meter-reading-reminder` - Send meter reading reminder
- `POST /api/emails/notification` - Send generic notification

## Template Customization

All email templates are located in the `templates/` directory. To customize a template:

1. Open the corresponding template file (e.g., `registration-code.template.ts`)
2. Modify the HTML content while maintaining the structure
3. Keep translations for all three languages

### Adding a New Template

1. Create a new file in `templates/` folder
2. Define template functions for each language
3. Export them from `templates/index.ts`
4. Create a corresponding DTO in `dto/send-email.dto.ts`
5. Add a method to `EmailService`
6. Add an endpoint to `EmailController`

## Best Practices

1. **Always specify language**: Pass the `language` parameter when sending emails based on user preferences
2. **Test templates**: Use the API endpoints to test templates before deployment
3. **Validate emails**: Ensure email addresses are validated before sending
4. **Rate limiting**: Consider implementing rate limiting for email sending
5. **Error handling**: Implement proper error handling and logging for failed email sends

## Troubleshooting

### Email not sending
- Verify `RESEND_API_KEY` and `RESEND_FROM` are set correctly
- Check Resend service status
- Verify the sender domain is verified with Resend

### Wrong language
- Check the `language` parameter is set correctly ('en', 'ru', or 'lv')
- The default language is 'en' if not specified

### Missing information in template
- Ensure all required parameters are passed to the method
- Check the DTO for required vs. optional fields

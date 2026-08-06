# Email Module Structure

```text
emails/
  controllers/
    email.controller.ts
  dto/
    send-email.dto.ts
  services/
    email.service.ts
    email-template.service.ts
    email-transport.service.ts
  templates/
    email-layout.template.ts
    invoice-generated.template.ts
    meter-reading-reminder.template.ts
    notification.template.ts
    owner-invitation.template.ts
    password-reset.template.ts
    registration-code.template.ts
    tenant-invitation.template.ts
    tenant-invited-by-owner.template.ts
    index.ts
  email.module.ts
  email.types.ts
  index.ts
  README.md
  STRUCTURE.md
```

## Responsibilities

- `EmailService`: public facade used by other modules.
- `EmailTransportService`: Resend configuration and delivery.
- `EmailTemplateService`: language normalization and template selection.
- `EmailController`: REST endpoints for manual/admin email sending.
- `templates/*`: HTML template factories.

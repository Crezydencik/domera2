import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from './domain-event';
import { DomainEventBus } from './domain-event-bus';

@Injectable()
export class InMemoryDomainEventBus implements DomainEventBus {
  private readonly logger = new Logger(InMemoryDomainEventBus.name);

  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    this.logger.debug(`event=${event.type} occurredAt=${event.occurredAt.toISOString()}`);
  }
}

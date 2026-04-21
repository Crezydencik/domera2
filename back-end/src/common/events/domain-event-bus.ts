import { DomainEvent } from './domain-event';

export interface DomainEventBus {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
}

export const DOMAIN_EVENT_BUS = Symbol('DOMAIN_EVENT_BUS');

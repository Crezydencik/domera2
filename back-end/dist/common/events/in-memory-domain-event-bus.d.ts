import { DomainEvent } from './domain-event';
import { DomainEventBus } from './domain-event-bus';
export declare class InMemoryDomainEventBus implements DomainEventBus {
    private readonly logger;
    publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
}

export interface DomainEvent<TPayload = unknown> {
    readonly type: string;
    readonly payload: TPayload;
    readonly occurredAt: Date;
}

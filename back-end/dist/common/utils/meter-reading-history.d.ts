type MeterHistoryEntry = {
    id: string;
    previousValue?: number | null;
    currentValue?: number | null;
    consumption?: number | null;
    month?: number;
    year?: number;
    submittedAt?: Date | string;
};
export declare const buildMeterHistorySnapshot: (history: MeterHistoryEntry[], options?: {
    collapseMonthly?: boolean;
}) => {
    history: {
        previousValue: number | null;
        consumption: number;
        id: string;
        currentValue?: number | null;
        month?: number;
        year?: number;
        submittedAt?: Date | string;
    }[];
    latestReading: {
        previousValue: number | null;
        consumption: number;
        id: string;
        currentValue?: number | null;
        month?: number;
        year?: number;
        submittedAt?: Date | string;
    } | null;
};
export {};

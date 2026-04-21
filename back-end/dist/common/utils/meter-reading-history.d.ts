type MeterHistoryEntry = {
    id: string;
    previousValue?: number | null;
    currentValue?: number | null;
    consumption?: number | null;
    month?: number;
    year?: number;
    submittedAt?: Date | string;
};
export declare const buildMeterHistorySnapshot: (history: MeterHistoryEntry[]) => {
    history: {
        previousValue: number | null;
        consumption: number | null;
        id: string;
        currentValue?: number | null;
        month?: number;
        year?: number;
        submittedAt?: Date | string;
    }[];
    latestReading: {
        previousValue: number | null;
        consumption: number | null;
        id: string;
        currentValue?: number | null;
        month?: number;
        year?: number;
        submittedAt?: Date | string;
    } | null;
};
export {};

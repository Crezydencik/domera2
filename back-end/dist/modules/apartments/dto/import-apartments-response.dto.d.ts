export declare class ImportApartmentsResultsDto {
    imported: number;
    errors: string[];
    skippedDuplicates: string[];
    createdApartments: string[];
}
export declare class ImportApartmentsResponseDto {
    success: boolean;
    results: ImportApartmentsResultsDto;
}

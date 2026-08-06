export type ApartmentRecord = Record<string, unknown>;

export type ApartmentCodeContext = {
  companyCode: string;
  buildingCode: string;
};

export type ApartmentWriteOperation = (batch: FirebaseFirestore.WriteBatch) => void;

export type ReadingConfigOverride = {
  useBuildingDefaults: boolean;
  hotWaterMeters: number;
  coldWaterMeters: number;
};

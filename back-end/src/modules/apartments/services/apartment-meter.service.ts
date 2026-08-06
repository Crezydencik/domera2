import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ReadingConfigOverride } from '../types/apartment.types';

@Injectable()
export class ApartmentMeterService {
  normalizeReadingConfigOverride(payload: { readingConfigOverride?: unknown }): ReadingConfigOverride | undefined {
    const raw = payload.readingConfigOverride;
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }

    const config = raw as Record<string, unknown>;
    const useBuildingDefaults = config.useBuildingDefaults !== false;
    const hotWaterMeters = Math.max(0, Math.trunc(Number(config.hotWaterMeters ?? 0) || 0));
    const coldWaterMeters = Math.max(0, Math.trunc(Number(config.coldWaterMeters ?? 0) || 0));

    return {
      useBuildingDefaults,
      hotWaterMeters: useBuildingDefaults ? 0 : hotWaterMeters,
      coldWaterMeters: useBuildingDefaults ? 0 : coldWaterMeters,
    };
  }

  buildEmptyWaterReadings(
    apartmentId: string,
    buildingId: string,
    building: Record<string, unknown>,
    readingConfigOverride?: ReadingConfigOverride,
  ): Record<string, unknown> {
    const readingConfig = building.readingConfig && typeof building.readingConfig === 'object'
      ? (building.readingConfig as Record<string, unknown>)
      : {};
    const waterEnabled = Boolean(readingConfig.waterEnabled);
    const electricityEnabled = Boolean(readingConfig.electricityEnabled);
    if (!waterEnabled && !electricityEnabled && readingConfigOverride?.useBuildingDefaults !== false) {
      return {};
    }

    const count = (value: unknown) => Math.max(0, Math.trunc(Number(value ?? 0) || 0));
    const digitCount = (value: unknown) => Math.min(7, Math.max(5, Math.trunc(Number(value ?? 6) || 6)));
    const hotWaterMeters = readingConfigOverride?.useBuildingDefaults === false
      ? readingConfigOverride.hotWaterMeters
      : count(readingConfig.hotWaterMetersPerResident);
    const coldWaterMeters = readingConfigOverride?.useBuildingDefaults === false
      ? readingConfigOverride.coldWaterMeters
      : count(readingConfig.coldWaterMetersPerResident);

    const waterReadings: Record<string, unknown> = {};
    if (hotWaterMeters > 0) {
      waterReadings.hotmeterwater = {
        meterId: randomUUID(),
        serialNumber: '',
        checkDueDate: '',
        history: [],
        apartmentId,
        buildingId,
      };
    }
    if (coldWaterMeters > 0) {
      waterReadings.coldmeterwater = {
        meterId: randomUUID(),
        serialNumber: '',
        checkDueDate: '',
        history: [],
        apartmentId,
        buildingId,
      };
    }
    if (electricityEnabled && readingConfig.electricityUserSetsDigits !== true) {
      waterReadings.electricitymeter = {
        meterId: randomUUID(),
        serialNumber: '',
        meterDigits: digitCount(readingConfig.electricityMeterDigits),
        checkDueDate: '',
        history: [],
        apartmentId,
        buildingId,
      };
    }

    return waterReadings;
  }

  sanitizeWaterReadingPatch(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const allowedMeterKeys = new Set(['coldmeterwater', 'hotmeterwater', 'electricitymeter']);
    const patch: Record<string, unknown> = {};

    for (const [meterKey, rawMeter] of Object.entries(value as Record<string, unknown>)) {
      if (!allowedMeterKeys.has(meterKey) || !rawMeter || typeof rawMeter !== 'object' || Array.isArray(rawMeter)) {
        continue;
      }

      const meter = rawMeter as Record<string, unknown>;
      const nextMeter: Record<string, unknown> = {};
      if ('serialNumber' in meter) {
        nextMeter.serialNumber = typeof meter.serialNumber === 'string' ? meter.serialNumber.trim() : '';
      }
      if ('checkDueDate' in meter) {
        nextMeter.checkDueDate = typeof meter.checkDueDate === 'string' ? meter.checkDueDate.trim() : '';
      }
      if ('meterDigits' in meter) {
        const meterDigits = Number(meter.meterDigits);
        if (Number.isInteger(meterDigits) && meterDigits >= 1 && meterDigits <= 12) {
          nextMeter.meterDigits = meterDigits;
        }
      }

      if (Object.keys(nextMeter).length > 0) {
        patch[meterKey] = nextMeter;
      }
    }

    return Object.keys(patch).length > 0 ? patch : undefined;
  }
}

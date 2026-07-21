import { CatalogKey, Make } from '@/lib/types';
import { automotiveMakes } from './automotive';
import { motorcycleMakes } from './motorcycle';
import { marineMakes } from './marine';
import { aviationMakes } from './aviation';

export const catalogs: Record<CatalogKey, Make[]> = {
  automotive: automotiveMakes,
  motorcycle: motorcycleMakes,
  marine: marineMakes,
  aviation: aviationMakes,
};

export function getMakes(catalog: CatalogKey): Make[] {
  return catalogs[catalog] ?? [];
}

export function getModels(catalog: CatalogKey, makeName: string): string[] {
  return catalogs[catalog]?.find((m) => m.name === makeName)?.models ?? [];
}

export { automotiveMakes, motorcycleMakes, marineMakes, aviationMakes };

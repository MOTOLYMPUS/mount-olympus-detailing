// ─────────────────────────────────────────────────────────────────────────────
// Request parsing for the mileage routes. POST and PATCH accept the same full
// shape, so both go through one parser and cannot drift apart.
//
// Throws ApiError with a field map; withAuth turns that into a 400.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, int, str, text } from './api';
import { TRIP_SOURCES, TripSource, TripStop } from './models';
import { BusinessVehicleInput, TripInput, getBusinessVehicle } from './repo/mileage';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ODOMETER_KEY_RE = /^odometer\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/;
const MAX_ODOMETER = 2_000_000;
/** 2,000 miles in one trip is a cross-country drive, not a detailing day; larger is a typo. */
const MAX_TRIP_TENTHS = 20_000;

function optionalDate(v: unknown, field: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
    throw new ApiError('Enter a valid date.', 400, { [field]: 'Use YYYY-MM-DD.' });
  }
  return v;
}

function optionalOdometer(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > MAX_ODOMETER) {
    throw new ApiError('Enter an odometer reading in whole miles.', 400, { [field]: 'Not a valid reading.' });
  }
  return Math.round(n);
}

export function parseVehicleInput(b: Record<string, unknown>): BusinessVehicleInput {
  const description = str(b.description, 120);
  if (!description) throw new ApiError('Describe the vehicle.', 400, { description: 'Year, make and model.' });

  const activeFrom = optionalDate(b.activeFrom, 'activeFrom');
  const retiredOn = optionalDate(b.retiredOn, 'retiredOn');
  if (activeFrom && retiredOn && retiredOn < activeFrom) {
    throw new ApiError('The last day of use is before the first.', 400, { retiredOn: 'Must be after the first day.' });
  }

  return {
    description,
    ownership: b.ownership === 'personal' ? 'personal' : 'business',
    placedInServiceOn: optionalDate(b.placedInServiceOn, 'placedInServiceOn'),
    odometerInService: optionalOdometer(b.odometerInService, 'odometerInService'),
    deductionMethod: b.deductionMethod === 'actual' ? 'actual' : 'standard',
    qualifiedNonpersonal: b.qualifiedNonpersonal === true,
    isDefault: b.isDefault === true,
    activeFrom,
    retiredOn,
    notes: text(b.notes, 1000),
  };
}

export function parseVehicleYears(v: unknown): { taxYear: number; odometerStart: number | null; odometerEnd: number | null }[] | null {
  if (v === undefined) return null;
  if (!Array.isArray(v)) throw new ApiError('Odometer years are not valid.', 400);
  return v.slice(0, 50).map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const taxYear = int(r.taxYear, 0);
    if (taxYear < 2000 || taxYear > 2100) throw new ApiError('Enter a four-digit tax year.', 400, { [`years.${i}`]: 'Bad year.' });
    const odometerStart = optionalOdometer(r.odometerStart, `years.${i}.odometerStart`);
    const odometerEnd = optionalOdometer(r.odometerEnd, `years.${i}.odometerEnd`);
    if (odometerStart !== null && odometerEnd !== null && odometerEnd < odometerStart) {
      throw new ApiError(`The ${taxYear} year-end reading is below the starting reading.`, 400);
    }
    return { taxYear, odometerStart, odometerEnd };
  });
}

function parseStops(v: unknown): TripStop[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 20)
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const stop: TripStop = { label: str(r.label, 120), address: str(r.address, 200) };
      const appointmentId = str(r.appointmentId, 60);
      if (appointmentId) stop.appointmentId = appointmentId;
      return stop;
    })
    .filter((s) => s.label || s.address);
}

/**
 * Miles come from exactly one place, by `source`:
 *   odometer  end − start (both required)
 *   manual / gps / route  the typed or measured figure, or blank for "not known yet"
 * A trip with no miles is always flagged for review.
 */
export function parseTripInput(b: Record<string, unknown>, existingDate?: string): TripInput {
  const tripDate = str(b.tripDate, 10);
  if (!DATE_RE.test(tripDate)) throw new ApiError('Enter the trip date.', 400, { tripDate: 'Use YYYY-MM-DD.' });
  // A job completed ahead of its date logs a trip on that date; editing it
  // without moving the date is fine.
  const maxDate = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  if (tripDate > maxDate && tripDate !== existingDate) throw new ApiError('That date is in the future.', 400, { tripDate: 'Cannot be a future date.' });

  const businessVehicleId = str(b.businessVehicleId, 60) || null;
  if (businessVehicleId && !getBusinessVehicle(businessVehicleId)) {
    throw new ApiError('That vehicle no longer exists.', 400, { businessVehicleId: 'Unknown vehicle.' });
  }

  const source = (TRIP_SOURCES as readonly string[]).includes(String(b.source)) ? (b.source as TripSource) : 'manual';
  const odometerStart = optionalOdometer(b.odometerStart, 'odometerStart');
  const odometerEnd = optionalOdometer(b.odometerEnd, 'odometerEnd');

  let milesTenths: number | null;
  if (source === 'odometer') {
    if (odometerStart === null || odometerEnd === null) {
      throw new ApiError('Enter both odometer readings.', 400, { odometerEnd: 'Start and end are required.' });
    }
    if (odometerEnd <= odometerStart) {
      throw new ApiError('The ending reading must be above the starting one.', 400, { odometerEnd: 'Must be higher.' });
    }
    milesTenths = (odometerEnd - odometerStart) * 10;
  } else if (b.miles === null || b.miles === undefined || b.miles === '') {
    milesTenths = null;
  } else {
    const miles = Number(b.miles);
    if (!Number.isFinite(miles) || miles < 0) throw new ApiError('Enter the miles.', 400, { miles: 'Not a number.' });
    milesTenths = Math.round(miles * 10);
  }
  if (milesTenths !== null && milesTenths > MAX_TRIP_TENTHS) {
    throw new ApiError('That is more than 2,000 miles for one trip — check the figure.', 400, { miles: 'Too large.' });
  }

  const photo = (v: unknown, field: string) => {
    const key = str(v, 200);
    if (!key) return null;
    if (!ODOMETER_KEY_RE.test(key)) throw new ApiError('That photo has not been uploaded yet.', 400, { [field]: 'Invalid photo.' });
    return key;
  };

  const purpose = str(b.purpose, 300);
  if (!purpose) throw new ApiError('Say what the trip was for.', 400, { purpose: 'e.g. "Supply run — Chemical Guys".' });

  return {
    tripDate,
    businessVehicleId,
    startAddress: str(b.startAddress, 200),
    stops: parseStops(b.stops),
    endAddress: str(b.endAddress, 200),
    purpose,
    milesTenths,
    source,
    odometerStart,
    odometerEnd,
    odometerStartKey: photo(b.odometerStartKey, 'odometerStartKey'),
    odometerEndKey: photo(b.odometerEndKey, 'odometerEndKey'),
    needsReview: milesTenths === null || !businessVehicleId,
    reviewReason:
      milesTenths === null ? 'Miles not entered yet.' : !businessVehicleId ? 'No vehicle chosen.' : '',
    notes: text(b.notes, 1000),
  };
}

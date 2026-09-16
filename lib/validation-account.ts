// ─────────────────────────────────────────────────────────────────────────────
// Validation for account, vehicle, and booking payloads.
//
// Deliberately hand-rolled, matching lib/validation.ts — the estimate payload
// already validates this way and adding a schema library for the second form
// would leave the security-critical path split across two idioms.
// ─────────────────────────────────────────────────────────────────────────────

import { getIndustry, getVehicleType } from './industries';
import { Industry, SizeClass, isIndustry } from './types';
import { normalizePhone } from './validation';
import { str, text } from './api';
import { VehicleInput } from './repo/vehicles';

export interface Validated<T> {
  ok: boolean;
  errors: Record<string, string>;
  value?: T;
}

// Same permissive rule as lib/validation.ts — over-strict email regexes reject
// valid addresses, and the confirmation email is the real proof.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function validEmail(v: unknown): string | null {
  const email = str(v, 254).toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

// ── Registration ─────────────────────────────────────────────────────────────

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  smsConsent: boolean;
  /** Push notifications — ON unless the form explicitly sent false. */
  pushOptIn: boolean;
  referralCode: string;
}

export function validateRegistration(body: unknown): Validated<RegisterInput> {
  const errors: Record<string, string> = {};
  const b = (body ?? {}) as Record<string, unknown>;

  const name = str(b.name, 100);
  if (name.length < 2) errors.name = 'Please enter your full name.';

  const email = validEmail(b.email);
  if (!email) errors.email = 'Please enter a valid email address.';

  const phone = normalizePhone(str(b.phone, 32));
  if (phone.length !== 10) errors.phone = 'Please enter a valid 10-digit US phone number.';

  // Length is checked here; strength is checked by checkPasswordPolicy in
  // lib/auth.ts so the rule lives with the hashing it protects.
  const password = typeof b.password === 'string' ? b.password : '';
  if (!password) errors.password = 'Please choose a password.';

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    errors: {},
    value: {
      name,
      email: email!,
      phone,
      password,
      smsConsent: b.smsConsent === true,
      // Opt-OUT semantics, unlike SMS: absent or anything but false means on.
      pushOptIn: b.pushOptIn !== false,
      referralCode: str(b.referralCode, 12).toUpperCase(),
    },
  };
}

// ── Profile ──────────────────────────────────────────────────────────────────

export interface ProfileInput {
  name: string;
  phone: string;
  address: string;
  smsConsent: boolean;
  /** Only written when the form sends a boolean; otherwise left unchanged. */
  pushOptIn?: boolean;
}

export function validateProfile(body: unknown): Validated<ProfileInput> {
  const errors: Record<string, string> = {};
  const b = (body ?? {}) as Record<string, unknown>;

  const name = str(b.name, 100);
  if (name.length < 2) errors.name = 'Please enter your full name.';

  const phone = normalizePhone(str(b.phone, 32));
  if (phone.length !== 10) errors.phone = 'Please enter a valid 10-digit US phone number.';

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    errors: {},
    value: {
      name,
      phone,
      address: str(b.address, 200),
      smsConsent: b.smsConsent === true,
      pushOptIn: typeof b.pushOptIn === 'boolean' ? b.pushOptIn : undefined,
    },
  };
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

/**
 * A VIN is 17 characters and never contains I, O or Q — those were excluded by
 * the standard precisely because they are confusable with 1 and 0. Rejecting
 * them catches the most common transcription error.
 */
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export function validateVehicle(body: unknown): Validated<VehicleInput> {
  const errors: Record<string, string> = {};
  const b = (body ?? {}) as Record<string, unknown>;

  const industryRaw = b.industry;
  if (!isIndustry(industryRaw)) {
    return { ok: false, errors: { industry: 'Please choose a category.' } };
  }
  const industry: Industry = industryRaw;
  const config = getIndustry(industry);

  const vehicleType = str(b.vehicleType, 40);
  const typeDef = getVehicleType(industry, vehicleType);
  if (!typeDef) errors.vehicleType = 'Please choose a type.';

  const sizeClass = str(b.sizeClass, 40) as SizeClass;
  if (!config.sizes.some((s) => s.id === sizeClass)) {
    errors.sizeClass = 'Please choose a size.';
  } else if (typeDef && !typeDef.sizes.includes(sizeClass)) {
    // Same guard as the estimate validator: stops a hand-crafted payload
    // pairing a jet-ski size with a yacht type to reach cheaper pricing.
    errors.sizeClass = 'That size is not valid for the selected type.';
  }

  const make = str(b.make, 80);
  if (!make) errors.make = `Please enter a ${config.makeLabel.toLowerCase()}.`;

  const model = str(b.model, 80);
  if (!model) errors.model = `Please enter a ${config.modelLabel.toLowerCase()}.`;

  const year = str(b.year, 4).replace(/\D/g, '');
  const maxYear = new Date().getFullYear() + 2;
  if (year && (year.length !== 4 || Number(year) < 1900 || Number(year) > maxYear)) {
    errors.year = `Please enter a year between 1900 and ${maxYear}.`;
  }

  const vin = str(b.vin, 17).toUpperCase().replace(/\s/g, '');
  if (vin && !VIN_RE.test(vin)) {
    errors.vin = 'A VIN is 17 characters and cannot contain I, O or Q.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    errors: {},
    value: {
      industry,
      vehicleType,
      sizeClass,
      year,
      make,
      model,
      trim: str(b.trim, 60),
      color: str(b.color, 40),
      vin,
      plate: str(b.plate, 12).toUpperCase(),
      notes: text(b.notes, 1000),
      isDefault: b.isDefault === true,
    },
  };
}

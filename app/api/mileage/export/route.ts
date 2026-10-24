// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mileage/export?year=2026&vehicle=<id|none> — the Mileage Log as CSV.
//
// Admin only. Columns match the "Mileage Log" tab of the owner's Schedule C
// workbook, in the same order, so a year's rows paste straight in. Dates are
// MM/DD/YYYY as in the workbook; miles to one decimal.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { str, withAuth } from '@/lib/api';
import { csvDocument } from '@/lib/csv';
import { Trip } from '@/lib/models';
import { listBusinessVehicles, listTrips } from '@/lib/repo/mileage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADER = [
  'Date',
  'Starting Point',
  'Destination / Customer',
  'Business Purpose',
  'Odometer Start',
  'Odometer End',
  'Miles',
  'Business Miles',
  'Notes',
  'Vehicle',
];

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const miles = (tenths: number | null) => (tenths === null ? '' : (tenths / 10).toFixed(1));

function destination(t: Trip): string {
  const stops = t.stops.map((s) => (s.label && s.address ? `${s.label} - ${s.address}` : s.label || s.address));
  // A one-way trip that ends somewhere other than where it started: show the end.
  if (t.endAddress && t.endAddress !== t.startAddress) stops.push(t.endAddress);
  return stops.join(' -> ');
}

function notes(t: Trip): string {
  const parts: string[] = [];
  const roundTrip = !!t.startAddress && t.startAddress === t.endAddress;
  if (roundTrip) parts.push(t.stops.length > 1 ? `Round trip; ${t.stops.length} stops - one loop` : 'Round trip');
  if (t.source === 'route' && t.milesTenths !== null) parts.push('miles from OpenStreetMap driving route');
  if (t.source === 'gps') parts.push('miles from phone GPS');
  if (t.needsReview) parts.push(`NEEDS REVIEW: ${t.reviewReason || 'check this trip'}`);
  if (t.notes) parts.push(t.notes);
  return parts.join('; ');
}

export const GET = withAuth('admin', async ({ query }) => {
  const year = Number(query.get('year'));
  const valid = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const vehicleId = str(query.get('vehicle'), 60) || undefined;

  const trips = listTrips({
    from: valid ? `${year}-01-01` : undefined,
    to: valid ? `${year}-12-31` : undefined,
    vehicleId,
    limit: 100_000,
  }).reverse(); // oldest first, like the workbook

  const vehicleName = new Map(listBusinessVehicles().map((v) => [v.id, v.description]));

  const rows = trips.map((t) => [
    usDate(t.tripDate),
    t.startAddress,
    destination(t),
    t.purpose,
    t.odometerStart ?? '',
    t.odometerEnd ?? '',
    // "Miles (if no odometer)" in the workbook: blank when the readings carry it.
    t.source === 'odometer' ? '' : miles(t.milesTenths),
    miles(t.milesTenths),
    notes(t),
    t.businessVehicleId ? (vehicleName.get(t.businessVehicleId) ?? '') : '',
  ]);

  const label = valid ? String(year) : 'all';
  return new NextResponse(csvDocument(HEADER, rows), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mount-olympus-mileage-${label}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

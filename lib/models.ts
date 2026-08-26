// ─────────────────────────────────────────────────────────────────────────────
// Platform domain model.
//
// lib/types.ts describes the *quoting* domain (industries, size classes,
// pricing) that the public marketing site already used. This file adds the
// entities the app introduces: people, vehicles they own, appointments, jobs,
// money, and messages.
//
// Every interface here maps 1:1 to a table in lib/db.ts and is produced by a
// repository in lib/repo/. Nothing outside those repositories sees a raw row.
// ─────────────────────────────────────────────────────────────────────────────

import { Industry, SizeClass } from './types';

// ── Roles ────────────────────────────────────────────────────────────────────

/**
 * Ordered least → most privileged. `lib/rbac.ts` compares by rank, so adding a
 * tier only means inserting it here in the right position.
 */
export const ROLES = ['customer', 'employee', 'manager', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

/** Anyone who works here, as opposed to a customer. */
export const STAFF_ROLES: Role[] = ['employee', 'manager', 'admin', 'owner'];
/** Anyone who can administer the business. */
export const ADMIN_ROLES: Role[] = ['admin', 'owner'];

// ── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  phone: string;
  smsConsent: boolean;
  emailVerified: boolean;
  active: boolean;
  address: string;
  notes: string;
  /** Cents per hour. Employees only; never exposed to customer-facing code. */
  hourlyRate: number | null;
  hiredAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/**
 * The subset of a user that is safe to serialise to any authenticated client.
 * `password_hash` has no representation in TypeScript at all — it never leaves
 * lib/repo/users.ts.
 */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  name: string;
  phone: string;
  smsConsent: boolean;
  active: boolean;
  address: string;
  createdAt: string;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name,
    phone: u.phone,
    smsConsent: u.smsConsent,
    active: u.active,
    address: u.address,
    createdAt: u.createdAt,
  };
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

export interface Vehicle {
  id: string;
  userId: string;
  industry: Industry;
  /** VehicleType id from lib/industries.ts — 'car', 'yacht', 'helicopter', … */
  vehicleType: string;
  sizeClass: SizeClass;
  year: string;
  make: string;
  model: string;
  trim: string;
  color: string;
  vin: string;
  plate: string;
  notes: string;
  photoUrl: string | null;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export function vehicleLabel(v: Vehicle): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Untitled vehicle';
}

// ── Appointments ─────────────────────────────────────────────────────────────

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type LocationType = 'mobile' | 'shop';

export interface Appointment {
  id: string;
  reference: string;
  customerId: string;
  vehicleId: string | null;
  employeeId: string | null;
  estimateId: string | null;

  industry: Industry;
  sizeClass: SizeClass;
  serviceIds: string[];
  addOnIds: string[];

  locationType: LocationType;
  address: string;
  serviceAreaId: string | null;

  /** ISO 8601 UTC. The customer-visible window. */
  startsAt: string;
  endsAt: string;
  /** Held either side of the window so the calendar can't be packed solid. */
  travelMinutes: number;
  bufferMinutes: number;

  quotedTotal: number;
  quotedTotalMax: number;
  estimatedHours: number;
  depositCents: number;
  paidCents: number;

  status: AppointmentStatus;
  notes: string;
  photoUrls: string[];
  cancelReason: string | null;
  cancelledAt: string | null;
  remindedAt: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** An appointment joined with the names the UI needs to render a row. */
export interface AppointmentView extends Appointment {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  employeeName: string | null;
  vehicleLabel: string | null;
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export type JobStatus = 'assigned' | 'in_progress' | 'paused' | 'completed';

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface MaterialUse {
  name: string;
  qty: number;
  unit: string;
  costCents: number;
}

export interface Job {
  id: string;
  appointmentId: string;
  employeeId: string | null;
  status: JobStatus;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  /** Milliseconds spent paused, so duration reflects worked time only. */
  pausedMs: number;
  durationMinutes: number | null;
  checklist: ChecklistItem[];
  materials: MaterialUse[];
  completionNotes: string;
  signatureData: string | null;
  signedBy: string;
  signedAt: string | null;
  customerRating: number | null;
  customerFeedback: string;
  revenueCents: number;
  createdAt: string;
  updatedAt: string;
}

export type PhotoKind = 'before' | 'after' | 'progress';

export interface JobPhoto {
  id: string;
  jobId: string;
  kind: PhotoKind;
  url: string;
  caption: string;
  uploadedBy: string | null;
  createdAt: string;
}

// ── Scheduling configuration ─────────────────────────────────────────────────

/** Minutes from local midnight. `null` for a day the business is closed. */
export interface DayHours {
  start: number;
  end: number;
}

export type BusinessHours = Record<string, DayHours | null>;

export interface EmployeeShift {
  id: string;
  employeeId: string;
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface TimeOff {
  id: string;
  employeeId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  status: string;
  createdAt: string;
}

export interface Holiday {
  id: string;
  date: string;
  label: string;
}

export interface ServiceArea {
  id: string;
  name: string;
  postalCodes: string[];
  travelMinutes: number;
  surchargeCents: number;
  active: boolean;
}

// ── Loyalty & memberships ────────────────────────────────────────────────────

export const LOYALTY_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const;
export type LoyaltyTier = (typeof LOYALTY_TIERS)[number];

/** Lifetime points required to reach each tier. */
export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  bronze: 0,
  silver: 500,
  gold: 1500,
  platinum: 4000,
};

/** Standing discount granted by tier, in percent. */
export const TIER_DISCOUNT: Record<LoyaltyTier, number> = {
  bronze: 0,
  silver: 5,
  gold: 8,
  platinum: 12,
};

export interface LoyaltyAccount {
  userId: string;
  points: number;
  lifetimePoints: number;
  tier: LoyaltyTier;
  referralCode: string;
  referredBy: string | null;
  updatedAt: string;
}

export interface LoyaltyEvent {
  id: string;
  userId: string;
  kind: 'earn' | 'redeem' | 'referral' | 'adjustment' | 'expiry';
  points: number;
  note: string;
  appointmentId: string | null;
  createdAt: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  interval: string;
  discountPct: number;
  included: string[];
  active: boolean;
}

export interface Membership {
  id: string;
  userId: string;
  planId: string;
  status: string;
  startedAt: string;
  renewsAt: string | null;
  cancelledAt: string | null;
  providerRef: string | null;
}

// ── Commerce ─────────────────────────────────────────────────────────────────

export type PaymentKind = 'deposit' | 'balance' | 'tip' | 'refund' | 'membership';

export interface Payment {
  id: string;
  appointmentId: string | null;
  userId: string | null;
  kind: PaymentKind;
  amountCents: number;
  status: string;
  provider: string;
  providerRef: string | null;
  methodLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  label: string;
  qty: number;
  unitCents: number;
}

export interface Invoice {
  id: string;
  number: string;
  appointmentId: string | null;
  userId: string;
  lines: InvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  status: 'draft' | 'sent' | 'paid' | 'void';
  issuedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

// ── Messaging ────────────────────────────────────────────────────────────────

export type ConversationKind = 'direct' | 'group' | 'announcement' | 'job';

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  jobId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  body: string;
  attachments: Attachment[];
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ConversationSummary extends Conversation {
  memberIds: string[];
  memberNames: string[];
  lastMessage: string;
  lastMessageAt: string | null;
  unread: number;
}

// ── Notifications ────────────────────────────────────────────────────────────

export const NOTIFICATION_KINDS = [
  'booking_created',
  'appointment_reminder',
  'estimate_requested',
  'estimate_accepted',
  'job_assigned',
  'job_completed',
  'message',
  'announcement',
  'customer_update',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface AppNotification {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  createdAt: string;
  failedAt: string | null;
}

// ── AI assistant ─────────────────────────────────────────────────────────────

export interface AssistantConversation {
  id: string;
  userId: string | null;
  title: string;
  escalated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

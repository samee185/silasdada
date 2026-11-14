export type Role = 'OWNER' | 'SECRETARY';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface SiteProfile {
  displayName: string;
  titleLine: string;
  welcomeLine: string | null;
  story: string | null;
  scripture: string | null;
  scriptureRef: string | null;
  portraitUrl: string | null;
  aboutPhotoUrl: string | null;
  casualPhotoUrl: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  meetingAddress: string | null;
  mapsUrl: string | null;
  socials: { youtube: string | null; facebook: string | null; instagram: string | null; tiktok: string | null; x: string | null };
  onboarded: boolean;
}

/** What PUT /api/site accepts (photo fields take media ids). */
export interface SiteProfileInput {
  displayName?: string;
  titleLine?: string;
  welcomeLine?: string;
  story?: string;
  scripture?: string;
  scriptureRef?: string;
  portraitId?: string | null;
  aboutPhotoId?: string | null;
  casualPhotoId?: string | null;
  publicEmail?: string;
  publicPhone?: string;
  meetingAddress?: string;
  mapsUrl?: string;
  youtube?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  x?: string;
}

export type ConfirmMode = 'AUTO' | 'APPROVE';
export type MeetingMode = 'IN_PERSON' | 'WHATSAPP' | 'BOTH';

export interface Settings {
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  maxPerDay: number | null;
  confirmMode: ConfirmMode;
}

export interface WeeklyBlock {
  weekday: number;
  start: string;
  end: string;
  mode: MeetingMode;
  location?: string | null;
}

/** "/media/abc123" → "abc123" */
export const mediaIdFromUrl = (url: string | null) => (url ? url.split('/').pop() ?? null : null);

// ─── Scheduler ───

export type SlotMode = 'IN_PERSON' | 'WHATSAPP' | 'BOTH';
export interface Slot { start: string; end: string; mode: SlotMode }
export interface DayAvailability { date: string; closed: boolean; changed: boolean; note: string | null; slots: Slot[] }
export interface Availability { today: string; lastDay: string; slotMinutes: number; confirmMode: ConfirmMode; days: DayAvailability[] }

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'NEEDS_RESCHEDULE' | 'COMPLETED' | 'EXPIRED';

export interface PublicBooking {
  name: string;
  phone: string;
  email: string;
  mode: 'IN_PERSON' | 'WHATSAPP';
  startAt: string;
  endAt: string;
  status: BookingStatus;
  statusNote: string | null;
}

export interface Appointment extends PublicBooking {
  id: string;
  reason: string | null;
  reasonCleared: boolean;
  isMember: boolean;
  createdAt: string;
  whatsappChat: string;
}

export interface WhatsAppItem {
  id: string;
  template: string;
  bookingId: string;
  name: string;
  phone: string;
  startAt: string;
  text: string;
  link: string;
}

export interface Summary {
  today: Appointment[];
  pending: number;
  newBookings: Appointment[];
  reschedule: number;
  whatsapp: WhatsAppItem[];
  next: Appointment | null;
}

export interface DayOverride { date: string; type: 'CLOSED' | 'CUSTOM'; note: string | null; blocks: { start: string; end: string; mode: SlotMode }[] }

// ─── Messages ───

export interface PostCard {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  scriptureRefs: string | null;
  coverVerse: string | null;
  coverRef: string | null;
  coverStyle: number;
  series: { name: string; slug: string } | null;
  seriesPart: number | null;
  preachedOn: string | null;
  publishedAt: string | null;
  readMinutes: number;
}

export interface PostFull extends PostCard {
  body: string;
  tags: string | null;
  discussion: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  shareCaption: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
  updatedAt: string;
  seriesId?: string | null;
}

export interface AdminPost extends PostCard { status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'; updatedAt: string }
export interface SeriesItem { id?: string; name: string; slug: string; description: string | null; count: number }

export interface SermonDraft {
  titles: string[];
  excerpt: string;
  bodyHtml: string;
  keyPoints: string[];
  scriptureRefs: string[];
  coverVerse: string;
  coverRef: string;
  discussion: string[];
  seoDescription: string;
  shareCaption: string;
}

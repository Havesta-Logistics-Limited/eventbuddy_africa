export type Role = "admin" | "staff" | "rep";

export interface Destination {
  id: string;
  name: string;
  flag: string;
}

export interface University {
  id: string;
  destinationId: string;
  name: string;
  shortName: string;
}

export type EventStatus = "upcoming" | "active" | "completed";

export interface EventRecord {
  id: string;
  name: string;
  date: string; // ISO date, start
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location: string; // "City, Country"
  venue: string;
  destinationIds: string[];
  description: string;
  coverImage?: string;
  /** Staff must enter this at check-in on /staff-setup for this event. Unset = no gate. */
  staffAccessCode?: string;
  /** University reps must enter this at check-in on /rep-login for this event. Unset = no gate. */
  repAccessCode?: string;
  createdAt: string;
}

/** Live status derived from dates — more accurate than a stored field that
 *  never transitions on its own. */
export function getEventStatus(event: Pick<EventRecord, "date" | "endDate">, now = new Date()): EventStatus {
  const start = new Date(event.date);
  const end = new Date(event.endDate || event.date);
  end.setHours(23, 59, 59, 999);
  if (now > end) return "completed";
  if (now >= start) return "active";
  return "upcoming";
}

/** Staff and rep check-in records (device-local session, no password — see
 *  loginAsStaff/loginAsRep). The signed-in admin is a real Supabase Auth user
 *  identified via organizations.owner_user_id, not a row in this table; the
 *  admin session below is bridged into this same shape for a stable useSession(). */
export interface StaffRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  destinationId?: string;
  universityId?: string;
  eventId?: string;
  /** Reps only — prevents two people signing in as the same rep at once. */
  isOnline?: boolean;
  /** Admin only — the org's slug, e.g. for building /[orgSlug]/staff-setup links to share. */
  orgSlug?: string;
}

export type LevelOfInterest = "BSc" | "MSc" | "PhD";
export type HighestEducation = "Undergraduate" | "BSc" | "MSc" | "PhD";
export type IeltsStatus = "No" | "Yes" | "Registered";

export interface LeadRecord {
  id: string;
  eventId: string;
  destinationId: string;
  universityId: string;
  staffId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  preferredCourse: string;
  levelOfInterest: LevelOfInterest | "";
  startYear: string;
  highestEducation: HighestEducation | "";
  takenIELTS: IeltsStatus | "";
  comments: string;
  createdAt: string;
}

/** The signed-in user on this device/browser. Mirrors StaffRecord plus the
 *  event/destination/university a staff or rep session is locked to. */
export type Session = StaffRecord;

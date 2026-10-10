/**
 * The scheduled jobs (netlify/functions/*-cron.mts → /api/cron/*), for the
 * platform admin's Job health tab. `everyHours` is how often each runs; a job
 * is flagged overdue when its last run is older than that plus a grace hour.
 * Keep in step with each function's `schedule` (Netlify runs them in UTC; the
 * times here are Lagos time, UTC+1).
 */
export const CRON_JOBS = [
  { job: "event-reminders", label: "Event reminders", what: "Emails attendees 24 hours and 1 hour before their event", schedule: "Every hour", everyHours: 1 },
  { job: "draft-reminders", label: "Draft reminders", what: "Reminds organizers about events saved as drafts but never published", schedule: "Every 2 hours", everyHours: 2 },
  { job: "rsvp-reminders", label: "RSVP reminders", what: "Nudges invited guests who haven't replied as their event approaches", schedule: "Daily, 10:00 am", everyHours: 24 },
  { job: "data-retention", label: "Data retention", what: "Removes personal data past its retention period, and warns exhibitors first", schedule: "Daily, 3:15 am", everyHours: 24 },
  { job: "rate-limits-cleanup", label: "Rate-limit cleanup", what: "Clears old sign-in and form rate-limit records", schedule: "Daily, 4:30 am", everyHours: 24 },
] as const;

export type CronJobName = (typeof CRON_JOBS)[number]["job"];

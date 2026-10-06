/** Budget bands a visitor picks when requesting a Full-Service quote. Shared by
 *  the /managed-events form and its API route, which only accepts these. */
export const BUDGET_OPTIONS = [
  "Under ₦500,000",
  "₦500,000 – ₦1,000,000",
  "₦1,000,000 – ₦2,500,000",
  "₦2,500,000 – ₦5,000,000",
  "Above ₦5,000,000",
  "Not sure yet",
] as const;

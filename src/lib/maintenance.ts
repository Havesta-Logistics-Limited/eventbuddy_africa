import { createClient } from "@/lib/supabase/client";

export const DEFAULT_MAINTENANCE_TITLE = "We'll be right back";
export const DEFAULT_MAINTENANCE_MESSAGE = "eventbuddy is undergoing scheduled maintenance. We'll be back online shortly — thanks for your patience.";

export type MaintenanceState = {
  maintenanceMode: boolean;
  maintenanceTitle: string;
  maintenanceMessage: string;
};

const DEFAULT_STATE: MaintenanceState = {
  maintenanceMode: false,
  maintenanceTitle: DEFAULT_MAINTENANCE_TITLE,
  maintenanceMessage: DEFAULT_MAINTENANCE_MESSAGE,
};

/** Publicly readable — proxy.ts and the /maintenance page both call this
 *  unauthenticated, the same way the pricing page reads the live event price. */
export async function fetchMaintenanceState(): Promise<MaintenanceState> {
  const supabase = createClient();
  const { data } = await supabase.from("platform_settings").select("maintenance_mode, maintenance_title, maintenance_message").eq("id", true).maybeSingle();
  if (!data) return DEFAULT_STATE;
  return {
    maintenanceMode: !!data.maintenance_mode,
    maintenanceTitle: data.maintenance_title || DEFAULT_MAINTENANCE_TITLE,
    maintenanceMessage: data.maintenance_message || DEFAULT_MAINTENANCE_MESSAGE,
  };
}

/** Platform-admin only — RLS rejects this for anyone else, same as updateTicketFeePercentage. */
export async function updateMaintenanceState(next: MaintenanceState): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      maintenance_mode: next.maintenanceMode,
      maintenance_title: next.maintenanceTitle,
      maintenance_message: next.maintenanceMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw error;
}

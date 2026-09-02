import { getSupabaseClient } from "@/lib/supabase";

export const QUICK_ACTIONS = [
  { id: "new_endorsement", href: "/tools/endorsement-generator", label: "New Endorsement" },
  { id: "flight_brief", href: "/tools/flight-brief", label: "Create Flight Brief" },
  { id: "flight_computer", href: "/tools/flight-computer", label: "Flight Computer" },
  { id: "weight_balance", href: "/tools/wb", label: "Weight & Balance" },
  { id: "nighttime", href: "/tools/nighttime", label: "Night Time Calculator" },
  { id: "decoder", href: "/tools/decoder", label: "Aviation Decoder" },
  { id: "my_aircraft", href: "/dashboard/my-aircraft", label: "My Aircraft" },
  { id: "safety_reports", href: "/dashboard/reports", label: "Safety Reports" },
  { id: "records", href: "/dashboard/records", label: "View Records" },
  { id: "people", href: "/dashboard/saved-people", label: "Manage People" },
  { id: "notifications", href: "/dashboard/notifications", label: "Notifications" },
  { id: "account", href: "/dashboard/account-settings", label: "Account Settings" },
] as const;

export type QuickActionId = (typeof QUICK_ACTIONS)[number]["id"];

export const OPTIONAL_FEATURES = [
  {
    id: "cfi_schedule",
    href: "/dashboard/schedule",
    label: "CFI Schedule",
    description: "Coordinate student availability, lessons, and flight-resource blocks.",
  },
] as const;

export type OptionalFeatureId = (typeof OPTIONAL_FEATURES)[number]["id"];

export const DEFAULT_QUICK_ACTION_IDS: QuickActionId[] = [
  "new_endorsement",
  "flight_brief",
  "weight_balance",
  "records",
  "people",
];

const quickActionIdSet = new Set<string>(QUICK_ACTIONS.map((action) => action.id));
const optionalFeatureIdSet = new Set<string>(OPTIONAL_FEATURES.map((feature) => feature.id));

function normalizeQuickActionIds(value: unknown): QuickActionId[] {
  if (!Array.isArray(value)) return [...DEFAULT_QUICK_ACTION_IDS];

  const selected = new Set(
    value.filter((id): id is QuickActionId => typeof id === "string" && quickActionIdSet.has(id))
  );
  const normalized = QUICK_ACTIONS.filter((action) => selected.has(action.id)).map((action) => action.id);
  return normalized.length > 0 ? normalized : [...DEFAULT_QUICK_ACTION_IDS];
}

export function normalizeEnabledFeatureIds(value: unknown): OptionalFeatureId[] {
  if (!Array.isArray(value)) return [];
  return OPTIONAL_FEATURES
    .filter((feature) => optionalFeatureIdSet.has(feature.id) && value.includes(feature.id))
    .map((feature) => feature.id);
}

export async function fetchDashboardQuickActionIds(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dashboard_preferences")
    .select("quick_action_ids")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return normalizeQuickActionIds(data?.quick_action_ids);
}

export async function updateDashboardQuickActionIds(userId: string, quickActionIds: QuickActionId[]) {
  const normalized = normalizeQuickActionIds(quickActionIds);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dashboard_preferences")
    .upsert(
      {
        user_id: userId,
        quick_action_ids: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("quick_action_ids")
    .single();

  if (error) throw error;
  return normalizeQuickActionIds(data.quick_action_ids);
}

export async function fetchEnabledFeatureIds(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dashboard_preferences")
    .select("enabled_feature_ids")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return normalizeEnabledFeatureIds(data?.enabled_feature_ids);
}

export async function updateEnabledFeatureIds(userId: string, featureIds: OptionalFeatureId[]) {
  const normalized = normalizeEnabledFeatureIds(featureIds);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dashboard_preferences")
    .upsert(
      {
        user_id: userId,
        enabled_feature_ids: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("enabled_feature_ids")
    .single();

  if (error) throw error;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pilotseal:features-changed", { detail: { userId } }));
  }
  return normalizeEnabledFeatureIds(data.enabled_feature_ids);
}

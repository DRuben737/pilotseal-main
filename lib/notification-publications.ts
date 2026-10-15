import { getSupabaseClient } from "@/lib/supabase";
import type { NotificationPriority } from "@/lib/notifications";

export type NotificationPublication = {
  id: string;
  organization_id: string | null;
  title: string;
  message: string;
  priority: NotificationPriority;
  status: "draft" | "scheduled" | "sent" | "withdrawn";
  scheduled_at: string | null;
  expires_at: string | null;
  action_url: string | null;
  requires_acknowledgement: boolean;
  audience_user_ids: string[] | null;
  revision: number;
  created_at: string;
};
export type PublicationAudienceMember = { user_id: string; display_name: string; group_keys: string[] };
export type PublicationReceipt = Omit<PublicationAudienceMember, "group_keys"> & { displayed_at: string | null; read_at: string | null; acknowledged_at: string | null; completed_at: string | null };

export async function fetchNotificationPublications(organizationId: string | null) {
  let query = getSupabaseClient().from("notification_publications").select("*").order("created_at", { ascending: false });
  query = organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as NotificationPublication[];
}
export async function fetchPublicationAudience(organizationId: string | null) {
  const { data, error } = await getSupabaseClient().rpc("get_notification_publication_audience_groups", { p_organization_id: organizationId });
  if (error) throw error;
  return (data ?? []) as PublicationAudienceMember[];
}
export async function fetchPublicationReport(id: string) {
  const { data, error } = await getSupabaseClient().rpc("get_notification_publication_report", { p_id: id });
  if (error) throw error;
  return (data ?? []) as PublicationReceipt[];
}
export async function saveNotificationPublication(organizationId: string | null, publication: Omit<NotificationPublication, "id" | "organization_id" | "revision" | "created_at"> & { id?: string }) {
  const { data, error } = await getSupabaseClient().rpc("save_notification_publication", {
    p_id: publication.id || null, p_organization_id: organizationId, p_title: publication.title,
    p_message: publication.message, p_priority: publication.priority, p_status: publication.status,
    p_scheduled_at: publication.scheduled_at, p_expires_at: publication.expires_at,
    p_action_url: publication.action_url, p_requires_acknowledgement: publication.requires_acknowledgement,
    p_audience_user_ids: publication.audience_user_ids,
  });
  if (error) throw error;
  return String(data);
}
export async function withdrawNotificationPublication(id: string) {
  const { error } = await getSupabaseClient().rpc("withdraw_notification_publication", { p_id: id });
  if (error) throw error;
}

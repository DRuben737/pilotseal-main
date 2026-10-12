import { getSupabaseClient } from "@/lib/supabase";

export type ReportActionContext = {
  report_updated_at: string;
  return_organization_id: string | null;
  can_delete: boolean; can_hide: boolean; can_return_to_service: boolean;
  aircraft_id: string | null; aircraft_status: string | null; grounding_note: string | null;
  other_grounding_reports: { id: string; description: string }[];
  other_grounding_count: number; token: string;
};
export type ReportActionRecord = { id: string; updated_at: string; status: string; hidden_at: string | null };

export async function fetchReportActionContext(reportId: string): Promise<ReportActionContext> {
  const { data, error } = await getSupabaseClient().rpc("get_organization_report_action_context", { p_report_id: reportId });
  if (error) throw error;
  return data as ReportActionContext;
}

export async function performReportAction(input: {
  report: Pick<ReportActionRecord, "id" | "updated_at">; action: "close" | "hide" | "unhide" | "delete";
  returnToService?: boolean; contextToken?: string | null; review?: unknown; safetyReview?: unknown; reason?: string;
}) {
  const { error } = await getSupabaseClient().rpc("perform_organization_report_action", {
    p_report_id: input.report.id, p_expected_updated_at: input.report.updated_at, p_action: input.action,
    p_return_to_service: input.returnToService ?? false, p_context_token: input.contextToken ?? null,
    p_review: input.review ?? null, p_safety_review: input.safetyReview ?? null, p_reason: input.reason?.trim() ?? null,
  });
  if (error) throw error;
}

export async function fetchHiddenOrganizationEndorsements(organizationId: string) {
  const { data, error } = await getSupabaseClient().from("organization_endorsement_visibility").select("record_id").eq("organization_id", organizationId);
  if (error) throw error;
  return new Set((data ?? []).map(record => String(record.record_id)));
}

export async function setOrganizationEndorsementHidden(organizationId: string, recordId: string, hidden: boolean) {
  const { error } = await getSupabaseClient().rpc("set_organization_endorsement_hidden", { p_organization_id: organizationId, p_record_id: recordId, p_hidden: hidden });
  if (error) throw error;
}

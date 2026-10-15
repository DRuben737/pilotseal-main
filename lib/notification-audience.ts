import type { PublicationAudienceMember } from "./notification-publications";

const groupLabels: Record<string, string> = { instructors: "Instructors", students: "Students", unassigned: "Unassigned members", administrators: "Administrators", members: "Members" };

export function publicationAudienceGroups(audience: PublicationAudienceMember[]) {
  return Object.entries(groupLabels).map(([key, label]) => ({ key, label, ids: audience.filter(member => member.group_keys.includes(key)).map(member => member.user_id) })).filter(group => group.ids.length > 0);
}

export function changeAudienceSelection(selected: string[], ids: string[], checked: boolean) {
  return checked ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id));
}

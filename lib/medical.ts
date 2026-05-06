import type { UserProfile } from "@/lib/profile";

export type MedicalPrivilege = {
  label: string;
  expiresAt: Date;
  daysRemaining: number;
  status: "valid" | "expiring-soon" | "expired";
};

function parseIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageAtDate(birthDate: Date, date: Date) {
  let age = date.getFullYear() - birthDate.getFullYear();
  const monthDelta = date.getMonth() - birthDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && date.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

function endOfCalendarMonthAfter(examDate: Date, months: number) {
  return new Date(
    examDate.getFullYear(),
    examDate.getMonth() + months + 1,
    0,
    23,
    59,
    59,
    999
  );
}

function createPrivilege(label: string, expiresAt: Date): MedicalPrivilege {
  const now = new Date();
  const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);

  return {
    label,
    expiresAt,
    daysRemaining,
    status:
      daysRemaining < 0
        ? "expired"
        : daysRemaining <= 90
          ? "expiring-soon"
          : "valid",
  };
}

export function getMedicalPrivileges(profile: UserProfile | null): MedicalPrivilege[] {
  const medicalClass = profile?.medical_class;
  const examDate = parseIsoDate(profile?.medical_exam_date);
  const birthDate = parseIsoDate(profile?.medical_birth_date);

  if (!medicalClass || !examDate || !birthDate) {
    return [];
  }

  const under40AtExam = ageAtDate(birthDate, examDate) < 40;
  const thirdClassMonths = under40AtExam ? 60 : 24;

  if (medicalClass === 1) {
    return [
      createPrivilege(
        "First-class privilege",
        endOfCalendarMonthAfter(examDate, under40AtExam ? 12 : 6)
      ),
      createPrivilege("Second-class privilege", endOfCalendarMonthAfter(examDate, 12)),
      createPrivilege("Third-class privilege", endOfCalendarMonthAfter(examDate, thirdClassMonths)),
    ];
  }

  if (medicalClass === 2) {
    return [
      createPrivilege("Second-class privilege", endOfCalendarMonthAfter(examDate, 12)),
      createPrivilege("Third-class privilege", endOfCalendarMonthAfter(examDate, thirdClassMonths)),
    ];
  }

  return [createPrivilege("Third-class privilege", endOfCalendarMonthAfter(examDate, thirdClassMonths))];
}

export function formatMedicalPrivilegeDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function formatMedicalPrivilegeRemaining(privilege: MedicalPrivilege) {
  const absoluteDays = Math.abs(privilege.daysRemaining);

  if (privilege.daysRemaining < 0) {
    return `Expired ${absoluteDays} day${absoluteDays === 1 ? "" : "s"} ago`;
  }

  return `${privilege.daysRemaining} day${privilege.daysRemaining === 1 ? "" : "s"} left`;
}

export function resolveDisplayIdentity(options: {
  displayName?: string | null;
  defaultCfiName?: string | null;
  email?: string | null;
}) {
  return (
    options.displayName?.trim() ||
    options.defaultCfiName?.trim() ||
    options.email?.trim() ||
    "User"
  );
}

export function formatTimeUntilDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const targetDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(targetDate.getTime())) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const diffMs = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    if (overdueDays <= 1) {
      return "Expired 1 day ago";
    }
    if (overdueDays < 30) {
      return `Expired ${overdueDays} days ago`;
    }

    const overdueMonths = Math.round(overdueDays / 30);
    return `Expired ${overdueMonths} month${overdueMonths === 1 ? "" : "s"} ago`;
  }

  if (diffDays === 0) {
    return "Expires today";
  }

  if (diffDays === 1) {
    return "1 day remaining";
  }

  if (diffDays < 30) {
    return `${diffDays} days remaining`;
  }

  const months = Math.round(diffDays / 30);
  return `${months} month${months === 1 ? "" : "s"} remaining`;
}

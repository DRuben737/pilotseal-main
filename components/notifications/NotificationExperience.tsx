"use client";

import { usePathname } from "next/navigation";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import NotificationPush from "@/components/notifications/NotificationPush";

export default function NotificationExperience() {
  const { session } = useAuthSession();
  const pathname = usePathname();
  if (!session?.user || ["/login", "/register", "/reset-password"].includes(pathname)) return null;
  return <NotificationPush key={session.user.id} userId={session.user.id} />;
}

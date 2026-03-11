"use client";

import { useEffect, useState } from "react";

import { fetchActiveNotifications, type NotificationRecord } from "@/lib/notifications";

export default function SiteNotificationBanner() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const data = await fetchActiveNotifications();
        if (!cancelled) {
          setNotifications(data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || dismissed || notifications.length === 0) {
    return null;
  }

  return (
    <div className="px-3">
      <section className="site-shell site-notice-shell">
        <div className="site-notice-head">
          <p className="muted-kicker">Site notice</p>
          <button type="button" className="site-notice-close" onClick={() => setDismissed(true)}>
            Close
          </button>
        </div>
        <div className="site-notice-list">
          {notifications.map((notification) => (
            <article key={notification.id} className="site-notice-card">
              <div className="flex items-center gap-2">
                <h2>{notification.title}</h2>
                <span className={`saas-pill saas-pill-${notification.priority}`}>
                  {notification.priority}
                </span>
              </div>
              <p>{notification.message}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const priority = ["critical", "high", "normal", "low"].includes(data.priority) ? data.priority : "normal";
  event.waitUntil(self.registration.showNotification(data.title || "PilotSeal", {
    body: data.body || "You have a new notification.",
    icon: "/brand/pilotseal-mark.png", badge: "/brand/pilotseal-mark-mono-navy.png",
    tag: data.id || undefined, renotify: priority === "critical" || priority === "high",
    requireInteraction: priority === "critical", silent: priority === "low",
    data: { url: data.url || "/console/personal/notifications", id: data.id, priority },
    actions: priority === "critical"
      ? [{ action: "open", title: "Review now" }]
      : [{ action: "open", title: "View" }, { action: "dismiss", title: "Dismiss" }],
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const target = new URL(event.notification.data?.url || "/console/personal/notifications", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => client.url.startsWith(self.location.origin));
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});

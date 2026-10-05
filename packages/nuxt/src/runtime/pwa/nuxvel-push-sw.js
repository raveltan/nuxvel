self.addEventListener("push", (event) => {
  const notification = event.data ? event.data.json() : {};

  event.waitUntil(
    self.registration.showNotification(notification.title ?? "", {
      body: notification.body,
      icon: notification.icon,
      tag: notification.tag,
      data: { url: notification.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url ?? "/", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url === url);

      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});

FROM ubuntu:26.04
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y -q openssh-server sudo ufw unattended-upgrades tzdata iptables curl gnupg ca-certificates openssl logrotate iproute2 \
  && rm -rf /var/lib/apt/lists/*
RUN ln -sf /usr/share/zoneinfo/Europe/Berlin /etc/localtime \
  && rm /etc/apt/apt.conf.d/20auto-upgrades \
  && mkdir -p /root/.ssh /run/sshd \
  && echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKJ8nPq0fZ6Sy1dYc6FqzHf3gN1n5bXw0Dq8tU2Lh9Va operator@example.com" > /root/.ssh/authorized_keys
# systemd cannot boot in every container (not on a cgroup v1 host), so these record what needs a running systemd or kernel
RUN printf '#!/bin/sh\ncase "$1" in start|stop|restart|try-restart|reload|try-reload-or-restart|daemon-reload|reboot) echo "$*" >> /run/fake-systemctl ;; *) exec /usr/bin/systemctl "$@" ;; esac\n' > /usr/local/sbin/systemctl \
  && printf '#!/bin/sh\nif [ "$1" = --show=NAME ]; then cat /run/fake-swaps 2>/dev/null; else echo "$1" >> /run/fake-swaps; fi\n' > /usr/local/sbin/swapon \
  && chmod 755 /usr/local/sbin/systemctl /usr/local/sbin/swapon
CMD ["sleep", "infinity"]

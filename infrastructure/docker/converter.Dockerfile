# LibreOffice headless conversion service (separate container; internal network only).
FROM node:22.22.0-bookworm-slim

# Some deployment networks block plain HTTP egress (403/Forbidden on deb.debian.org).
# Patch ALL possible apt source file locations to use HTTPS mirrors before any apt call.
RUN set -eux; \
    # Patch DEB822 format (Bookworm slim default: /etc/apt/sources.list.d/debian.sources)
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i \
        's|http://deb.debian.org|https://deb.debian.org|g; \
         s|http://security.debian.org|https://security.debian.org|g' \
        /etc/apt/sources.list.d/debian.sources; \
    fi; \
    # Patch legacy one-liner format (/etc/apt/sources.list) if it exists
    if [ -f /etc/apt/sources.list ]; then \
      sed -i \
        's|http://deb.debian.org|https://deb.debian.org|g; \
         s|http://security.debian.org|https://security.debian.org|g' \
        /etc/apt/sources.list; \
    fi; \
    # Patch any remaining *.list files dropped by the base image
    find /etc/apt/sources.list.d/ -name '*.list' -exec sed -i \
      's|http://deb.debian.org|https://deb.debian.org|g; \
       s|http://security.debian.org|https://security.debian.org|g' {} +; \
    # First update & install ca-certificates with peer verification disabled
    # (slim image ships no CA bundle yet, so TLS cannot be verified at this step)
    apt-get -o Acquire::https::Verify-Peer=false \
            -o Acquire::https::Verify-Host=false update \
 && apt-get -o Acquire::https::Verify-Peer=false \
            -o Acquire::https::Verify-Host=false \
            install -y --no-install-recommends ca-certificates \
    # Second update now uses the freshly-installed CA bundle for full TLS verification
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui libreoffice-draw-nogui \
      fonts-liberation2 fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea fonts-noto-core poppler-utils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY converter/server.mjs ./server.mjs
USER node
ENV HOME=/tmp PORT=3100
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

# LibreOffice headless conversion service (separate container; internal network only).
FROM node:22.22.0-bookworm-slim
RUN apt-get update \
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

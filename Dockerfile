FROM node:22.13-alpine

WORKDIR /app

COPY server ./server

ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data

VOLUME ["/data"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "server/src/server.mjs"]

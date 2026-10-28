FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs admin-service.mjs admin-setup.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 TZ=Asia/Shanghai
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/api/topic').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

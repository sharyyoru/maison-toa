# The grouper is a Java library and Vercel's Node runtime has no JVM, so it
# runs as its own service on Google Cloud Run (see README.md).
FROM eclipse-temurin:21-jre-alpine

RUN apk add --no-cache nodejs

WORKDIR /app
COPY tarifmatcher-1.2.1-standalone.jar ./
COPY tariffs ./tariffs
COPY server.js package.json ./

# Each request starts one short-lived JVM; keep its heap small so several fit in 1 GiB.
ENV PORT=8080 JAVA_TOOL_OPTIONS="-Xmx256m -XX:+UseSerialGC -XX:TieredStopAtLevel=1"
EXPOSE 8080
USER 1000
# Docker-only; Cloud Run uses its own startup probe on /health (see deploy.sh).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.js"]

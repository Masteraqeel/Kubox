# Kubox: one container serves the website and the API.
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY index.html ./
COPY css css
COPY js js
COPY vendor vendor
COPY server/src server/src
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server/src/index.ts"]

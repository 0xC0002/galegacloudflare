FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node receiver.mjs ./receiver.mjs
USER node
CMD ["node", "receiver.mjs"]

FROM node:slim as builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

FROM node:alpine

RUN apk update && \
    apk add --no-cache \
    openssh-keygen \
    tini

WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/dist ./dist
RUN npm install --production

COPY entry.sh ./

ENTRYPOINT [ "/sbin/tini", "--" ]
CMD [ "/app/entry.sh" ]

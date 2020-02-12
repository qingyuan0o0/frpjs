FROM node as builder

WORKDIR /app

COPY package*.json ./

RUN npm install --registry=https://registry.npm.taobao.org

FROM astefanutti/scratch-node

ARG TZ='Asia/Shanghai'
ENV TZ ${TZ}

RUN apk add tzdata && ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo ${TZ} > /etc/timezone \
    && apk del tzdata

WORKDIR /app

COPY --from=builder /app ./

COPY . ./

ENTRYPOINT [ "node", "index.js" ]
# 基础镜像统一走 DaoCloud 镜像代理。
#
# 为什么：这套环境访问不了 docker.io（registry-1.docker.io 直接超时），
# 原样写 `FROM node:22-alpine` 会让构建卡在拉基础镜像上，而这是和代码无关的失败。
# docker.m.daocloud.io 是可用代理，若哪天 runner 配了 registry-mirrors
# 或者能直连 Docker Hub，用 --build-arg REGISTRY= 传空值即可回到默认仓库。
ARG REGISTRY=docker.m.daocloud.io/library/

FROM ${REGISTRY}node:22-alpine

ARG VITE_BUSINESS_API_URL
ENV VITE_BUSINESS_API_URL=${VITE_BUSINESS_API_URL}

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN chown -R node:node /app
USER node

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]

# 基础镜像统一走 DaoCloud 镜像代理。
#
# 为什么：这套环境访问不了 docker.io（registry-1.docker.io 直接超时），
# 原样写 `FROM maven:...` 会让构建卡在拉基础镜像上，而这是和代码无关的失败。
# docker.m.daocloud.io 是可用代理，若哪天 runner 配了 registry-mirrors
# 或者能直连 Docker Hub，用 --build-arg REGISTRY= 传空值即可回到默认仓库。
ARG REGISTRY=docker.m.daocloud.io/library/

FROM ${REGISTRY}maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build

# 先只拷 pom，命中依赖层缓存；context 就是 backend/ 目录本身。
COPY pom.xml .
RUN mvn -B -q dependency:go-offline -Dmaven.test.skip=true

COPY src ./src
RUN mvn -B -q package -DskipTests

# 运行时基础镜像用 21-jre，不是 21-jre-jdk：
# 后者不是 eclipse-temurin 的官方 tag（Docker Hub 上不存在这个 tag，
# 代理对不存在的 tag 返回 403），写了会在拉镜像时才炸。
# 21-jre 里已经带了 wget/curl（compose 的 healthcheck 要用 wget）。
FROM ${REGISTRY}eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=builder /build/target/decoration-backend-0.1.0-SNAPSHOT.jar ./backend.jar

RUN addgroup --system --gid 1000 decoration \
 && adduser --system --uid 1000 --gid 1000 --shell /usr/sbin/nologin --gecos "" decoration

ENV APP_UPLOAD_DIR=/data/uploads
RUN mkdir -p "${APP_UPLOAD_DIR}" && chown decoration:decoration "${APP_UPLOAD_DIR}" \
 && chown -R decoration:decoration /app

USER decoration

EXPOSE 8080

# 用 sh -c 才能展开 ${VAR:-default}；直接用 exec 形式的 ENTRYPOINT 不会做变量替换。
ENTRYPOINT ["sh", "-c", "exec java \
  -Dspring.datasource.url=\"${DATABASE_URL:-jdbc:postgresql://postgres:5432/decoration}\" \
  -Dspring.datasource.username=\"${DATABASE_USERNAME:-decoration}\" \
  -Dspring.datasource.password=\"${DATABASE_PASSWORD:-decoration}\" \
  -Dspring.profiles.active=\"${SPRING_PROFILES_ACTIVE:-prod}\" \
  -jar backend.jar"]

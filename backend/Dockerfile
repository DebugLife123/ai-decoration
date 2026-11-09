FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build

# 先只拷 pom，命中依赖层缓存；context 就是 backend/ 目录本身。
COPY pom.xml .
RUN mvn -B -q dependency:go-offline -Dmaven.test.skip=true

COPY src ./src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre-jdk AS runtime
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

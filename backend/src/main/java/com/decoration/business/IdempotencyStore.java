package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Idempotency-Key 处理。企业侧创建接口与个人侧创建接口共用同一套机制：
 * 键在 (owner_id, idempotency_key) 上唯一，请求体做 SHA-256 指纹，24 小时后过期。
 *
 * <p>owner 既可以是公司 ID（企业侧接口），也可以是用户 ID（个人侧接口），
 * 只要同一个接口族内保持恒定即可保证不互相干扰。
 */
@Component
public class IdempotencyStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public IdempotencyStore(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /**
     * 用幂等键登记一次创建，返回应以哪个资源 ID 作为结果。
     *
     * @return 已有记录的资源 ID（重放）；否则返回 {@code proposedId}（首次创建）
     */
    public UUID reserve(UUID ownerId, String key, String resourceType, Object request, UUID proposedId) {
        var now = Timestamp.from(Instant.now());
        jdbc.update("delete from business_idempotency_keys where company_id = ? and idempotency_key = ? and expires_at <= ?",
                ownerId, key, now);
        var hash = hash(request);
        jdbc.update("""
                insert into business_idempotency_keys(company_id, idempotency_key, request_hash, resource_type, resource_id, created_at, expires_at)
                values (?, ?, ?, ?, ?, ?, ?)
                on conflict (company_id, idempotency_key) do nothing
                """, ownerId, key, hash, resourceType, proposedId, now,
                Timestamp.from(now.toInstant().plusSeconds(86400)));
        var existing = jdbc.query("""
                select request_hash, resource_type, resource_id from business_idempotency_keys
                where company_id = ? and idempotency_key = ?
                """, (rs, row) -> new Reservation(rs.getString(1), rs.getString(2), rs.getObject(3, UUID.class)),
                ownerId, key).getFirst();
        if (!existing.requestHash().equals(hash) || !existing.resourceType().equals(resourceType)) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT",
                    "Idempotency key was used for a different request");
        }
        return existing.resourceId();
    }

    private String hash(Object request) {
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(objectMapper.writeValueAsBytes(request));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | JsonProcessingException exception) {
            throw new IllegalStateException("Unable to hash request", exception);
        }
    }

    private record Reservation(String requestHash, String resourceType, UUID resourceId) { }
}

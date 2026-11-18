package com.decoration.shared.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.UUID;

final class SessionTokenValidator implements OAuth2TokenValidator<Jwt> {
    private static final OAuth2Error INVALID = new OAuth2Error("invalid_token", "登录会话已退出，请重新登录。", null);
    private final JdbcTemplate jdbc;

    SessionTokenValidator(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        if (jdbc == null) return OAuth2TokenValidatorResult.success();
        try {
            var sessionId = token.getId();
            var userId = UUID.fromString(token.getSubject());
            if (sessionId == null || jdbc.queryForObject("""
                    select exists(select 1 from auth_sessions s join auth_users u on u.id = s.user_id
                        where s.id = ? and s.user_id = ? and u.account_status = 'ACTIVE'
                        and s.revoked_at is null and s.expires_at > now())
                    """, Boolean.class, UUID.fromString(sessionId), userId) != Boolean.TRUE) {
                return OAuth2TokenValidatorResult.failure(INVALID);
            }
            jdbc.update("update auth_sessions set last_seen_at = now() where id = ?", UUID.fromString(sessionId));
            return OAuth2TokenValidatorResult.success();
        } catch (RuntimeException exception) {
            return OAuth2TokenValidatorResult.failure(INVALID);
        }
    }
}

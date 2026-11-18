package com.decoration.auth;

import com.decoration.auth.AuthDtos.AuthResponse;
import com.decoration.auth.AuthDtos.LoginRequest;
import com.decoration.auth.AuthDtos.RegisterRequest;
import com.decoration.auth.AuthDtos.UpdateProfileRequest;
import com.decoration.auth.AuthDtos.ChangePasswordRequest;
import com.decoration.auth.AuthDtos.User;
import com.decoration.shared.api.BusinessApiException;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class AuthService {
    private static final long TOKEN_LIFETIME_SECONDS = 60 * 60 * 8;

    private final JdbcTemplate jdbc;
    private final PlatformContactService platformContact;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final byte[] jwtSecret;

    public AuthService(JdbcTemplate jdbc, PlatformContactService platformContact,
                       @Value("${app.security.jwt-secret}") String jwtSecret) {
        this.jdbc = jdbc;
        this.platformContact = platformContact;
        this.jwtSecret = jwtSecret.getBytes(StandardCharsets.UTF_8);
        if (this.jwtSecret.length < 32) {
            throw new IllegalArgumentException("JWT secret must contain at least 32 bytes");
        }
    }

    @Transactional
    public AuthResponse register(RegisterRequest request, String userAgent, String ipAddress) {
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "密码不能超过 72 个 UTF-8 字节");
        }
        var email = normalizeEmail(request.email());
        var accountType = normalizeAccountType(request.accountType());
        if (exists(email)) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该邮箱已注册");
        }
        var userId = UUID.randomUUID();
        var createdAt = Instant.now();
        var companyId = (UUID) null;
        var role = "PERSONAL_USER";
        if ("BUSINESS".equals(accountType)) {
            if (request.companyName() == null || request.companyName().isBlank()) {
                throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "企业账号必须填写企业名称");
            }
            companyId = UUID.randomUUID();
            role = "COMPANY_ADMIN";
            var now = Timestamp.from(createdAt);
            jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, ?)",
                    companyId, request.companyName().trim(), now);
            jdbc.update("""
                    insert into company_profiles(company_id, id, name, city, services, intro, version, created_at, updated_at)
                    values (?, ?, ?, '', '', '', 0, ?, ?)
                    """, companyId, UUID.randomUUID(), request.companyName().trim(), now, now);
        }
        try {
            jdbc.update("""
                    insert into auth_users(id, email, password_hash, display_name, account_type, company_id, role, created_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?)
                    """, userId, email, passwordEncoder.encode(request.password()), request.displayName().trim(),
                    accountType, companyId, role, Timestamp.from(createdAt));
        } catch (DuplicateKeyException exception) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该邮箱已注册");
        }
        return issue(userId, email, request.displayName().trim(), accountType, companyId, role,
                createdAt, null, null, userAgent, ipAddress);
    }

    @Transactional
    public AuthResponse login(LoginRequest request, String userAgent, String ipAddress) {
        return login(request, false, userAgent, ipAddress);
    }

    @Transactional
    public AuthResponse adminLogin(LoginRequest request, String userAgent, String ipAddress) {
        return login(request, true, userAgent, ipAddress);
    }

    private AuthResponse login(LoginRequest request, boolean adminOnly, String userAgent, String ipAddress) {
        var rows = jdbc.query("""
                select id, email, password_hash, display_name, account_type, company_id, role,
                       created_at, last_login_at, avatar_id, account_status
                from auth_users where lower(email) = ? for update
                """, (rs, row) -> new Account(rs.getObject("id", UUID.class), rs.getString("email"),
                rs.getString("password_hash"), rs.getString("display_name"), rs.getString("account_type"),
                rs.getObject("company_id", UUID.class), rs.getString("role"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("last_login_at") == null ? null : rs.getTimestamp("last_login_at").toInstant(),
                rs.getObject("avatar_id", UUID.class), rs.getString("account_status")), normalizeEmail(request.email()));
        if (rows.isEmpty() || !passwordEncoder.matches(request.password(), rows.getFirst().passwordHash())) {
            throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "邮箱或密码不正确");
        }
        var account = rows.getFirst();
        if (!"ACTIVE".equals(account.status())) {
            var contact = platformContact.publicContact();
            throw new BusinessApiException(HttpStatus.FORBIDDEN, "ACCOUNT_UNAVAILABLE",
                    contact.message().isBlank() ? "账号已停用或删除，请联系平台管理员" : contact.message(), contact);
        }
        if (adminOnly != ("PLATFORM_ADMIN".equals(account.role()))) {
            throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "管理员账号或密码不正确");
        }
        if (request.accountType() != null && !account.accountType().equals(normalizeAccountType(request.accountType()))) {
            throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "邮箱或密码不正确");
        }
        var lastLoginAt = Instant.now();
        jdbc.update("update auth_users set last_login_at = ? where id = ?", Timestamp.from(lastLoginAt), account.id());
        return issue(account.id(), account.email(), account.displayName(), account.accountType(), account.companyId(),
                account.role(), account.createdAt(), lastLoginAt, account.avatarId(), userAgent, ipAddress);
    }

    public User currentUser(UUID userId) {
        var rows = jdbc.query("""
                        select id, email, display_name, account_type, company_id, role,
                               created_at, last_login_at, avatar_id
                        from auth_users where id = ? and account_status = 'ACTIVE'
                        """,
                (rs, row) -> new User(rs.getObject("id", UUID.class), rs.getString("email"),
                        rs.getString("display_name"), rs.getString("account_type").toLowerCase(Locale.ROOT),
                        rs.getObject("company_id", UUID.class), rs.getString("role"),
                        rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("last_login_at") == null ? null : rs.getTimestamp("last_login_at").toInstant(),
                        rs.getObject("avatar_id", UUID.class)), userId);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "账号不存在或已失效");
        return rows.getFirst();
    }

    @Transactional
    public User updateProfile(UUID userId, UpdateProfileRequest request) {
        var updated = jdbc.update("update auth_users set display_name = ?, profile_updated_at = ? where id = ?",
                request.displayName().trim(), Timestamp.from(Instant.now()), userId);
        if (updated == 0) throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "账号不存在或已失效");
        return currentUser(userId);
    }

    @Transactional
    public void changePassword(UUID userId, UUID currentSessionId, ChangePasswordRequest request) {
        if (request.newPassword().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "新密码不能超过 72 个 UTF-8 字节");
        }
        var rows = jdbc.query("select password_hash from auth_users where id = ?", (rs, row) -> rs.getString("password_hash"), userId);
        if (rows.isEmpty()) {
            throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "账号不存在或已失效");
        }
        var currentHash = rows.getFirst();
        if (!passwordEncoder.matches(request.currentPassword(), currentHash)) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "CURRENT_PASSWORD_INVALID", "当前密码不正确");
        }
        if (passwordEncoder.matches(request.newPassword(), currentHash)) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "PASSWORD_UNCHANGED", "新密码不能与当前密码相同");
        }
        jdbc.update("update auth_users set password_hash = ?, profile_updated_at = ? where id = ?",
                passwordEncoder.encode(request.newPassword()), Timestamp.from(Instant.now()), userId);
        revokeOtherSessions(userId, currentSessionId);
    }

    public List<AuthDtos.UserSession> sessions(UUID userId, UUID currentSessionId) {
        jdbc.update("update auth_sessions set last_seen_at = now() where id = ? and user_id = ? and revoked_at is null",
                currentSessionId, userId);
        return jdbc.query("""
                        select id, device_name, user_agent, ip_address, created_at, last_seen_at, expires_at
                        from auth_sessions where user_id = ? and revoked_at is null and expires_at > now()
                        order by (id = ?) desc, last_seen_at desc
                        """,
                (rs, row) -> new AuthDtos.UserSession(rs.getObject("id", UUID.class), rs.getString("device_name"),
                        rs.getString("user_agent"), rs.getString("ip_address"), rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("last_seen_at").toInstant(), rs.getTimestamp("expires_at").toInstant(),
                        currentSessionId.equals(rs.getObject("id", UUID.class))), userId, currentSessionId);
    }

    @Transactional
    public void revokeSession(UUID userId, UUID sessionId) {
        if (jdbc.update("update auth_sessions set revoked_at = now() where id = ? and user_id = ? and revoked_at is null",
                sessionId, userId) == 0) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND", "登录会话不存在或已退出");
        }
    }

    @Transactional
    public int revokeOtherSessions(UUID userId, UUID currentSessionId) {
        return jdbc.update("update auth_sessions set revoked_at = now() where user_id = ? and id <> ? and revoked_at is null",
                userId, currentSessionId);
    }

    private AuthResponse issue(UUID id, String email, String displayName, String accountType, UUID companyId, String role,
                               Instant createdAt, Instant lastLoginAt, UUID avatarId, String userAgent, String ipAddress) {
        var issuedAt = Instant.now();
        var sessionId = UUID.randomUUID();
        var expiresAt = issuedAt.plusSeconds(TOKEN_LIFETIME_SECONDS);
        jdbc.update("""
                        insert into auth_sessions(id, user_id, device_name, user_agent, ip_address, created_at, last_seen_at, expires_at)
                        values (?, ?, ?, ?, ?, ?, ?, ?)
                        """, sessionId, id, deviceName(userAgent), safeHeader(userAgent), safeHeader(ipAddress),
                Timestamp.from(issuedAt), Timestamp.from(issuedAt), Timestamp.from(expiresAt));
        var claimsBuilder = new JWTClaimsSet.Builder()
                .subject(id.toString())
                .jwtID(sessionId.toString())
                .claim("accountType", accountType.toLowerCase(Locale.ROOT))
                .claim("roles", List.of(role))
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(expiresAt));
        claimsBuilder.claim("companyId", (companyId == null ? id : companyId).toString());
        var claims = claimsBuilder.build();
        try {
            var signed = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            signed.sign(new MACSigner(jwtSecret));
            return new AuthResponse(signed.serialize(), TOKEN_LIFETIME_SECONDS,
                    new User(id, email, displayName, accountType.toLowerCase(Locale.ROOT), companyId, role,
                            createdAt, lastLoginAt, avatarId));
        } catch (JOSEException exception) {
            throw new IllegalStateException("Unable to issue access token", exception);
        }
    }

    private static String safeHeader(String value) {
        if (value == null) return "";
        var sanitized = value.replaceAll("[\\r\\n]", "");
        return sanitized.substring(0, Math.min(sanitized.length(), 500));
    }

    private static String deviceName(String userAgent) {
        var agent = userAgent == null ? "" : userAgent;
        var browser = agent.contains("Edg/") ? "Edge" : agent.contains("Firefox/") ? "Firefox"
                : agent.contains("Chrome/") ? "Chrome" : agent.contains("Safari/") ? "Safari" : "浏览器";
        var platform = agent.contains("Windows") ? "Windows" : agent.contains("Mac OS") || agent.contains("Macintosh") ? "macOS"
                : agent.contains("Android") ? "Android" : agent.contains("iPhone") || agent.contains("iPad") ? "iOS"
                : agent.contains("Linux") ? "Linux" : "设备";
        return platform + " · " + browser;
    }

    private boolean exists(String email) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from auth_users where lower(email) = ?)", Boolean.class, email));
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeAccountType(String value) {
        var normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (!normalized.equals("PERSONAL") && !normalized.equals("BUSINESS")) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "账号类型必须是 personal 或 business");
        }
        return normalized;
    }

    private record Account(UUID id, String email, String passwordHash, String displayName, String accountType,
                           UUID companyId, String role, Instant createdAt, Instant lastLoginAt, UUID avatarId, String status) {
    }
}

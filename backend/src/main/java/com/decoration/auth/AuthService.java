package com.decoration.auth;

import com.decoration.auth.AuthDtos.AuthResponse;
import com.decoration.auth.AuthDtos.LoginRequest;
import com.decoration.auth.AuthDtos.RegisterRequest;
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
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final byte[] jwtSecret;

    public AuthService(JdbcTemplate jdbc,
                       @Value("${app.security.jwt-secret}") String jwtSecret) {
        this.jdbc = jdbc;
        this.jwtSecret = jwtSecret.getBytes(StandardCharsets.UTF_8);
        if (this.jwtSecret.length < 32) {
            throw new IllegalArgumentException("JWT secret must contain at least 32 bytes");
        }
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "密码不能超过 72 个 UTF-8 字节");
        }
        var email = normalizeEmail(request.email());
        var accountType = normalizeAccountType(request.accountType());
        if (exists(email)) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该邮箱已注册");
        }
        var userId = UUID.randomUUID();
        var companyId = (UUID) null;
        var role = "PERSONAL_USER";
        if ("BUSINESS".equals(accountType)) {
            if (request.companyName() == null || request.companyName().isBlank()) {
                throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "企业账号必须填写企业名称");
            }
            companyId = UUID.randomUUID();
            role = "COMPANY_ADMIN";
            var now = Timestamp.from(Instant.now());
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
                    accountType, companyId, role, Timestamp.from(Instant.now()));
        } catch (DuplicateKeyException exception) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该邮箱已注册");
        }
        return issue(userId, email, request.displayName().trim(), accountType, companyId, role);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        return login(request, false);
    }

    @Transactional
    public AuthResponse adminLogin(LoginRequest request) {
        return login(request, true);
    }

    private AuthResponse login(LoginRequest request, boolean adminOnly) {
        var rows = jdbc.query("""
                select id, email, password_hash, display_name, account_type, company_id, role
                from auth_users where lower(email) = ?
                """, (rs, row) -> new Account(rs.getObject("id", UUID.class), rs.getString("email"),
                rs.getString("password_hash"), rs.getString("display_name"), rs.getString("account_type"),
                rs.getObject("company_id", UUID.class), rs.getString("role")), normalizeEmail(request.email()));
        if (rows.isEmpty() || !passwordEncoder.matches(request.password(), rows.getFirst().passwordHash())) {
            throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "邮箱或密码不正确");
        }
        var account = rows.getFirst();
        if (adminOnly != ("PLATFORM_ADMIN".equals(account.role()))) {
            throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "管理员账号或密码不正确");
        }
        if (request.accountType() != null && !account.accountType().equals(normalizeAccountType(request.accountType()))) {
            throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "邮箱或密码不正确");
        }
        jdbc.update("update auth_users set last_login_at = ? where id = ?", Timestamp.from(Instant.now()), account.id());
        return issue(account.id(), account.email(), account.displayName(), account.accountType(), account.companyId(), account.role());
    }

    public User currentUser(UUID userId) {
        var rows = jdbc.query("select id, email, display_name, account_type, company_id, role from auth_users where id = ?",
                (rs, row) -> new User(rs.getObject("id", UUID.class), rs.getString("email"),
                        rs.getString("display_name"), rs.getString("account_type").toLowerCase(Locale.ROOT),
                        rs.getObject("company_id", UUID.class), rs.getString("role")), userId);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "账号不存在或已失效");
        return rows.getFirst();
    }

    private AuthResponse issue(UUID id, String email, String displayName, String accountType, UUID companyId, String role) {
        var issuedAt = Instant.now();
        var claimsBuilder = new JWTClaimsSet.Builder()
                .subject(id.toString())
                .claim("accountType", accountType.toLowerCase(Locale.ROOT))
                .claim("roles", List.of(role))
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(issuedAt.plusSeconds(TOKEN_LIFETIME_SECONDS)));
        claimsBuilder.claim("companyId", (companyId == null ? id : companyId).toString());
        var claims = claimsBuilder.build();
        try {
            var signed = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            signed.sign(new MACSigner(jwtSecret));
            return new AuthResponse(signed.serialize(), TOKEN_LIFETIME_SECONDS,
                    new User(id, email, displayName, accountType.toLowerCase(Locale.ROOT), companyId, role));
        } catch (JOSEException exception) {
            throw new IllegalStateException("Unable to issue access token", exception);
        }
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
                           UUID companyId, String role) {
    }
}

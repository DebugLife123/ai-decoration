package com.decoration.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Locale;

@Component
@ConditionalOnProperty(name = "app.admin.password-reset.enabled", havingValue = "true")
public class AdminPasswordResetRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminPasswordResetRunner.class);

    private final JdbcTemplate jdbc;
    private final String email;
    private final String password;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AdminPasswordResetRunner(JdbcTemplate jdbc,
                                    @org.springframework.beans.factory.annotation.Value("${app.admin.password-reset.email:}") String email,
                                    @org.springframework.beans.factory.annotation.Value("${app.admin.password-reset.password:}") String password) {
        this.jdbc = jdbc;
        this.email = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        this.password = password == null ? "" : password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (email.isBlank() || password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("Admin password reset requires an email and a password of 12-72 UTF-8 bytes");
        }

        var accounts = jdbc.query("select id, role, password_hash from auth_users where lower(email) = ?",
                (rs, row) -> new Account(rs.getObject("id", java.util.UUID.class), rs.getString("role"),
                        rs.getString("password_hash")), email);
        if (accounts.isEmpty()) {
            throw new IllegalStateException("No account exists for the admin reset email");
        }
        var account = accounts.getFirst();
        if (!"PLATFORM_ADMIN".equals(account.role())) {
            throw new IllegalStateException("The reset email does not belong to a platform admin");
        }
        if (passwordEncoder.matches(password, account.passwordHash())) {
            throw new IllegalStateException("The new admin password is the same as the current password");
        }

        jdbc.update("update auth_users set password_hash = ?, profile_updated_at = ? where id = ?",
                passwordEncoder.encode(password), Timestamp.from(Instant.now()), account.id());
        var revokedSessions = jdbc.update("update auth_sessions set revoked_at = now() where user_id = ? and revoked_at is null",
                account.id());
        log.info("Platform admin password reset for {}. Revoked {} active session(s).", email, revokedSessions);
    }

    private record Account(java.util.UUID id, String role, String passwordHash) {
    }
}

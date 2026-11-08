package com.decoration.auth;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Component
@ConditionalOnProperty(name = "app.admin.bootstrap.enabled", havingValue = "true")
public class AdminBootstrapRunner implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final String email;
    private final String password;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AdminBootstrapRunner(JdbcTemplate jdbc,
                                @org.springframework.beans.factory.annotation.Value("${app.admin.bootstrap.email:}") String email,
                                @org.springframework.beans.factory.annotation.Value("${app.admin.bootstrap.password:}") String password) {
        this.jdbc = jdbc;
        this.email = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        this.password = password == null ? "" : password;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (email.isBlank() || password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("Admin bootstrap requires an email and a password of 12-72 UTF-8 bytes");
        }
        var existingRoles = jdbc.query("select role from auth_users where lower(email) = ?",
                (rs, row) -> rs.getString("role"), email);
        if (!existingRoles.isEmpty()) {
            if (existingRoles.getFirst().equals("PLATFORM_ADMIN")) return;
            throw new IllegalStateException("Admin bootstrap email already belongs to a non-admin account");
        }
        try {
            jdbc.update("""
                    insert into auth_users(id, email, password_hash, display_name, account_type, company_id, role, created_at)
                    values (?, ?, ?, '平台管理员', 'PERSONAL', null, 'PLATFORM_ADMIN', ?)
                    """, UUID.randomUUID(), email, passwordEncoder.encode(password), Timestamp.from(Instant.now()));
        } catch (DuplicateKeyException exception) {
            var role = jdbc.query("select role from auth_users where lower(email) = ?", (rs, row) -> rs.getString("role"), email);
            if (role.isEmpty() || !role.getFirst().equals("PLATFORM_ADMIN")) throw exception;
        }
    }
}

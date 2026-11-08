package com.decoration.business;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class AdminAuditLogService {
    private final JdbcTemplate jdbc;

    public AdminAuditLogService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(UUID actorId, String action, String targetType, UUID targetId, String description) {
        jdbc.update("""
                insert into admin_audit_logs(id, actor_id, action, target_type, target_id, description, created_at)
                values (?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), actorId, action, targetType, targetId, description, Timestamp.from(Instant.now()));
    }

    public Page list(int requestedPage, int requestedSize, String action) {
        var page = Math.max(1, requestedPage);
        var size = Math.max(1, Math.min(100, requestedSize));
        var where = action == null || action.isBlank() ? "" : " where l.action = ?";
        var total = action == null || action.isBlank()
                ? jdbc.queryForObject("select count(*) from admin_audit_logs", Long.class)
                : jdbc.queryForObject("select count(*) from admin_audit_logs l" + where, Long.class, action);
        var sql = """
                select l.id, l.actor_id, u.email actor_email, l.action, l.target_type, l.target_id,
                    l.description, l.created_at
                from admin_audit_logs l
                left join auth_users u on u.id = l.actor_id
                """ + where + " order by l.created_at desc, l.id desc limit ? offset ?";
        var items = action == null || action.isBlank()
                ? jdbc.query(sql, AdminAuditLogService::map, size, (long) (page - 1) * size)
                : jdbc.query(sql, AdminAuditLogService::map, action, size, (long) (page - 1) * size);
        var safeTotal = total == null ? 0 : total;
        return new Page(items, page, size, safeTotal, (int) Math.ceil((double) safeTotal / size));
    }

    private static AuditEntry map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new AuditEntry(rs.getObject("id", UUID.class), rs.getObject("actor_id", UUID.class),
                rs.getString("actor_email"), rs.getString("action"), rs.getString("target_type"),
                rs.getObject("target_id", UUID.class), rs.getString("description"),
                rs.getTimestamp("created_at").toInstant());
    }

    public record AuditEntry(UUID id, UUID actorId, String actorEmail, String action, String targetType,
                             UUID targetId, String description, Instant createdAt) { }
    public record Page(List<AuditEntry> items, int page, int size, long total, int totalPages) { }
}

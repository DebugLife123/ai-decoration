package com.decoration.saas;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.decoration.saas.CreditDtos.*;

@Service
public class PersonalCreditService {
    private final JdbcTemplate jdbc;

    public PersonalCreditService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public CreditSummary summary(UUID userId) {
        var account = account(userId);
        var entries = jdbc.query("""
                select id, delta, balance_after, event_type, note, created_at
                from personal_credit_ledger where user_id = ?
                order by created_at desc, id desc limit 100
                """, (rs, row) -> new CreditLedgerEntry(rs.getObject("id", UUID.class), rs.getLong("delta"),
                rs.getLong("balance_after"), rs.getString("event_type"), rs.getString("note"),
                rs.getTimestamp("created_at").toInstant()), userId);
        return new CreditSummary(account, entries);
    }

    public List<AdminCreditUser> listUsers(String query) {
        var keyword = query == null ? "" : query.trim().toLowerCase();
        return jdbc.query("""
                select u.id, u.email, u.display_name, coalesce(a.balance, 0) as balance,
                       coalesce(a.updated_at, u.created_at) as updated_at
                from auth_users u left join personal_credit_accounts a on a.user_id = u.id
                where u.role = 'PERSONAL_USER' and u.account_status <> 'DELETED'
                  and (? = '' or lower(u.email) like ? or lower(u.display_name) like ?)
                order by coalesce(a.updated_at, u.created_at) desc, u.id
                limit 200
                """, (rs, row) -> new AdminCreditUser(rs.getObject("id", UUID.class), rs.getString("email"),
                rs.getString("display_name"), rs.getLong("balance"), rs.getTimestamp("updated_at").toInstant()),
                keyword, "%" + keyword + "%", "%" + keyword + "%");
    }

    @Transactional
    public CreditOperation reserve(UUID userId, String operationKey, long units) {
        requirePersonalUser(userId);
        if (operationKey == null || operationKey.isBlank() || operationKey.length() > 160) {
            throw invalid("请提供有效的 Idempotency-Key");
        }
        if (units < 1 || units > 100_000) throw invalid("积分扣除数量无效");
        var existing = findOperation(userId, operationKey.trim());
        if (existing != null) return existing;
        var account = lockAccount(userId);
        existing = findOperation(userId, operationKey.trim());
        if (existing != null) return existing;
        if (account.balance() < units) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "INSUFFICIENT_CREDITS",
                    "积分余额不足，本次生成需要 " + units + " 积分，当前余额为 " + account.balance() + " 积分");
        }
        var operationId = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        var balanceAfter = account.balance() - units;
        jdbc.update("update personal_credit_accounts set balance = ?, version = version + 1, updated_at = ? where user_id = ?",
                balanceAfter, now, userId);
        jdbc.update("""
                insert into personal_credit_operations(id, user_id, operation_key, units, status, created_at)
                values (?, ?, ?, ?, 'RESERVED', ?)
                """, operationId, userId, operationKey.trim(), units, now);
        jdbc.update("""
                insert into personal_credit_ledger(user_id, operation_id, delta, balance_after, event_type, note, created_at)
                values (?, ?, ?, ?, 'GENERATION_RESERVE', ?, ?)
                """, userId, operationId, -units, balanceAfter, "效果图生成预扣", now);
        return new CreditOperation(operationId, units, "RESERVED", null);
    }

    @Transactional
    public CreditOperation finalizeOperation(UUID userId, UUID operationId, boolean success) {
        requirePersonalUser(userId);
        var operation = jdbc.query("""
                select id, units, status, reference_id from personal_credit_operations
                where id = ? and user_id = ? for update
                """, (rs, row) -> new CreditOperation(rs.getObject("id", UUID.class), rs.getLong("units"),
                rs.getString("status"), rs.getObject("reference_id", UUID.class)), operationId, userId)
                .stream().findFirst().orElseThrow(() -> new BusinessApiException(HttpStatus.NOT_FOUND, "CREDIT_OPERATION_NOT_FOUND", "积分扣费操作不存在"));
        if (!"RESERVED".equals(operation.status())) return operation;
        if (success) {
            jdbc.update("update personal_credit_operations set status = 'COMMITTED', finalized_at = now() where id = ?", operationId);
            return new CreditOperation(operation.id(), operation.units(), "COMMITTED", operation.referenceId());
        }
        var account = lockAccount(userId);
        var now = Timestamp.from(Instant.now());
        var balanceAfter = account.balance() + operation.units();
        jdbc.update("update personal_credit_accounts set balance = ?, version = version + 1, updated_at = ? where user_id = ?",
                balanceAfter, now, userId);
        jdbc.update("update personal_credit_operations set status = 'REFUNDED', finalized_at = ? where id = ?", now, operationId);
        jdbc.update("""
                insert into personal_credit_ledger(user_id, operation_id, delta, balance_after, event_type, note, created_at)
                values (?, ?, ?, ?, 'GENERATION_REFUND', ?, ?)
                """, userId, operationId, operation.units(), balanceAfter, "效果图生成失败，积分已退回", now);
        return new CreditOperation(operation.id(), operation.units(), "REFUNDED", operation.referenceId());
    }

    @Transactional
    public CreditSummary grant(UUID userId, long units, String note) {
        requirePersonalUser(userId);
        if (units < 1 || units > 10_000_000) throw invalid("发放积分数量无效");
        var account = lockAccount(userId);
        var now = Timestamp.from(Instant.now());
        var balanceAfter = account.balance() + units;
        jdbc.update("update personal_credit_accounts set balance = ?, version = version + 1, updated_at = ? where user_id = ?",
                balanceAfter, now, userId);
        jdbc.update("""
                insert into personal_credit_ledger(user_id, delta, balance_after, event_type, note, created_at)
                values (?, ?, ?, 'ADMIN_GRANT', ?, ?)
                """, userId, units, balanceAfter, cleanNote(note), now);
        return summary(userId);
    }

    private CreditAccount account(UUID userId) {
        var rows = jdbc.query("select user_id, balance, updated_at from personal_credit_accounts where user_id = ?",
                (rs, row) -> new CreditAccount(rs.getObject("user_id", UUID.class), rs.getLong("balance"), rs.getTimestamp("updated_at").toInstant()), userId);
        if (!rows.isEmpty()) return rows.getFirst();
        jdbc.update("insert into personal_credit_accounts(user_id) values (?) on conflict (user_id) do nothing", userId);
        return jdbc.queryForObject("select user_id, balance, updated_at from personal_credit_accounts where user_id = ?",
                (rs, row) -> new CreditAccount(rs.getObject("user_id", UUID.class), rs.getLong("balance"), rs.getTimestamp("updated_at").toInstant()), userId);
    }

    private CreditAccount lockAccount(UUID userId) {
        jdbc.update("insert into personal_credit_accounts(user_id) values (?) on conflict (user_id) do nothing", userId);
        return jdbc.queryForObject("select user_id, balance, updated_at from personal_credit_accounts where user_id = ? for update",
                (rs, row) -> new CreditAccount(rs.getObject("user_id", UUID.class), rs.getLong("balance"), rs.getTimestamp("updated_at").toInstant()), userId);
    }

    private CreditOperation findOperation(UUID userId, String operationKey) {
        var rows = jdbc.query("select id, units, status, reference_id from personal_credit_operations where user_id = ? and operation_key = ?",
                (rs, row) -> new CreditOperation(rs.getObject("id", UUID.class), rs.getLong("units"), rs.getString("status"), rs.getObject("reference_id", UUID.class)), userId, operationKey);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private void requirePersonalUser(UUID userId) {
        var role = jdbc.query("select role from auth_users where id = ? and account_type = 'PERSONAL' and account_status <> 'DELETED'",
                (rs, row) -> rs.getString("role"), userId);
        if (role.isEmpty() || !"PERSONAL_USER".equals(role.getFirst())) throw new BusinessApiException(HttpStatus.FORBIDDEN, "PERSONAL_ACCOUNT_REQUIRED", "只有普通用户可以使用积分账户");
    }

    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }
    private static String cleanNote(String note) { return note == null || note.isBlank() ? "管理员发放测试积分" : note.trim(); }
}

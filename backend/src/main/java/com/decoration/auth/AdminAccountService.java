package com.decoration.auth;

import com.decoration.business.AdminAuditLogService;
import com.decoration.saas.CreditDtos.CreditLedgerEntry;
import com.decoration.shared.api.BusinessApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static com.decoration.auth.AdminAccountDtos.*;

@Service
public class AdminAccountService {
    private static final String MANAGED = "((u.role = 'PERSONAL_USER' and u.account_type = 'PERSONAL') or (u.role = 'COMPANY_ADMIN' and u.account_type = 'BUSINESS'))";
    private static final String FROM = """
            from auth_users u
            left join auth_companies c on c.id = u.company_id
            left join company_profiles p on p.company_id = u.company_id
            left join company_certifications cert on cert.company_id = u.company_id
            left join personal_credit_accounts a on a.user_id = u.id
            """;
    private static final String SELECT = """
            select u.id, u.email, u.display_name, u.account_type, u.account_status, u.company_id,
                   coalesce(p.name, c.name) company_name, coalesce(cert.status, 'NOT_SUBMITTED') certification_status,
                   coalesce(a.balance, 0) balance, u.created_at, u.last_login_at,
                   (select count(*) from material_quotes m where m.company_id = u.company_id) material_count,
                   (select count(*) from business_cases b where b.company_id = u.company_id) case_count
            """;
    private final JdbcTemplate jdbc;
    private final AdminAuditLogService audit;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder();

    public AdminAccountService(JdbcTemplate jdbc, AdminAuditLogService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public AccountPage list(String type, String status, String query, int page, int size) {
        if (!List.of("PERSONAL", "BUSINESS").contains(type)) throw invalid("账号类型不正确");
        if (!List.of("ALL", "ACTIVE", "DISABLED").contains(status)) throw invalid("账号状态不正确");
        var where = new StringBuilder(" where " + MANAGED + " and u.account_type = ? and u.account_status <> 'DELETED'");
        var args = new ArrayList<Object>();
        args.add(type);
        if (!status.equals("ALL")) { where.append(" and u.account_status = ?"); args.add(status); }
        if (query != null && !query.isBlank()) {
            where.append(" and (lower(u.email) like ? escape '!' or lower(u.display_name) like ? escape '!' or lower(coalesce(p.name, c.name, '')) like ? escape '!')");
            var keyword = "%" + query.trim().toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            args.addAll(List.of(keyword, keyword, keyword));
        }
        long total = jdbc.queryForObject("select count(*) " + FROM + where, Long.class, args.toArray());
        var safeSize = Math.max(1, Math.min(100, size));
        var safePage = Math.max(1, page);
        args.add(safeSize);
        args.add((long) (safePage - 1) * safeSize);
        var items = jdbc.query(SELECT + FROM + where + " order by u.created_at desc, u.id limit ? offset ?", AdminAccountService::map, args.toArray());
        return new AccountPage(items, safePage, safeSize, total, (int) Math.ceil((double) total / safeSize));
    }

    public Detail detail(UUID id) {
        var account = get(id);
        var entries = account.accountType().equals("PERSONAL") ? jdbc.query("""
                select id, delta, balance_after, event_type, note, created_at from personal_credit_ledger
                where user_id = ? order by created_at desc, id desc limit 100
                """, (rs, row) -> new CreditLedgerEntry(rs.getObject("id", UUID.class), rs.getLong("delta"),
                rs.getLong("balance_after"), rs.getString("event_type"), rs.getString("note"), rs.getTimestamp("created_at").toInstant()), id) : List.<CreditLedgerEntry>of();
        var submissions = jdbc.query("""
                select id, title, style, status, updated_at from inspiration_submissions
                where owner_id = ? order by updated_at desc, id limit 100
                """, (rs, row) -> new Submission(rs.getObject("id", UUID.class), rs.getString("title"),
                rs.getString("style"), rs.getString("status"), rs.getTimestamp("updated_at").toInstant()), id);
        return new Detail(account, entries, submissions);
    }

    @Transactional
    public Account create(UUID actorId, CreateRequest request) {
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) throw invalid("密码不能超过 72 个 UTF-8 字节");
        if (!List.of("PERSONAL", "BUSINESS").contains(request.accountType())) throw invalid("账号类型不正确");
        var email = request.email().trim().toLowerCase(Locale.ROOT);
        ensureUniqueEmail(email, null);
        var userId = UUID.randomUUID();
        UUID companyId = null;
        var now = Timestamp.from(Instant.now());
        if (request.accountType().equals("BUSINESS")) {
            var companyName = requireCompanyName(request.companyName());
            companyId = UUID.randomUUID();
            jdbc.update("insert into auth_companies(id, name, created_at) values (?, ?, ?)", companyId, companyName, now);
            jdbc.update("""
                    insert into company_profiles(company_id, id, name, city, services, intro, version, created_at, updated_at)
                    values (?, ?, ?, '', '', '', 0, ?, ?)
                    """, companyId, UUID.randomUUID(), companyName, now, now);
        }
        try {
            jdbc.update("""
                    insert into auth_users(id, email, password_hash, display_name, account_type, company_id, role, created_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?)
                    """, userId, email, passwords.encode(request.password()), request.displayName().trim(), request.accountType(),
                    companyId, companyId == null ? "PERSONAL_USER" : "COMPANY_ADMIN", now);
        } catch (DuplicateKeyException exception) { throw emailExists(); }
        audit.record(actorId, "ACCOUNT_CREATE", "USER_ACCOUNT", userId, "创建" + (companyId == null ? "个人" : "企业") + "账号：" + email);
        return get(userId);
    }

    @Transactional
    public Account update(UUID actorId, UUID id, UpdateRequest request) {
        lock(id);
        var current = get(id);
        var email = request.email().trim().toLowerCase(Locale.ROOT);
        ensureUniqueEmail(email, id);
        try {
            jdbc.update("update auth_users set email = ?, display_name = ?, profile_updated_at = now() where id = ?", email, request.displayName().trim(), id);
        } catch (DuplicateKeyException exception) { throw emailExists(); }
        if (current.companyId() != null) {
            var name = requireCompanyName(request.companyName());
            if (!name.equals(current.companyName())) {
                jdbc.update("update auth_companies set name = ? where id = ?", name, current.companyId());
                jdbc.update("update company_profiles set name = ?, version = version + 1, updated_at = now() where company_id = ?", name, current.companyId());
                jdbc.update("update company_certifications set company_name = ?, version = version + 1, updated_at = now() where company_id = ?", name, current.companyId());
            }
        }
        if (!email.equalsIgnoreCase(current.email())) revokeSessions(id);
        audit.record(actorId, "ACCOUNT_UPDATE", "USER_ACCOUNT", id, "修改账号资料：" + email);
        return get(id);
    }

    @Transactional
    public Account changeStatus(UUID actorId, UUID id, String status) {
        if (!List.of("ACTIVE", "DISABLED").contains(status)) throw invalid("账号状态不正确");
        lock(id);
        var current = get(id);
        if (!current.status().equals(status)) {
            jdbc.update("update auth_users set account_status = ?, account_status_changed_at = now() where id = ?", status, id);
            if (status.equals("DISABLED")) revokeSessions(id);
            audit.record(actorId, "ACCOUNT_STATUS", "USER_ACCOUNT", id, (status.equals("ACTIVE") ? "启用" : "停用") + "账号：" + current.email());
        }
        return get(id);
    }

    @Transactional
    public void delete(UUID actorId, UUID id) {
        lock(id);
        var current = get(id);
        jdbc.update("update auth_users set account_status = 'DELETED', deleted_at = now(), account_status_changed_at = now() where id = ?", id);
        revokeSessions(id);
        audit.record(actorId, "ACCOUNT_DELETE", "USER_ACCOUNT", id, "删除账号（保留业务历史）：" + current.email());
    }

    private Account get(UUID id) {
        return jdbc.query(SELECT + FROM + " where u.id = ? and " + MANAGED + " and u.account_status <> 'DELETED'", AdminAccountService::map, id)
                .stream().findFirst().orElseThrow(AdminAccountService::notFound);
    }

    private void lock(UUID id) {
        if (jdbc.query("select u.id from auth_users u where u.id = ? and " + MANAGED + " and u.account_status <> 'DELETED' for update", (rs, row) -> rs.getObject("id", UUID.class), id).isEmpty()) throw notFound();
    }

    private void revokeSessions(UUID id) { jdbc.update("update auth_sessions set revoked_at = now() where user_id = ? and revoked_at is null", id); }
    private void ensureUniqueEmail(String email, UUID exclude) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from auth_users where lower(trim(email)) = ? and (?::uuid is null or id <> ?))", Boolean.class, email, exclude, exclude))) throw emailExists();
    }
    private static String requireCompanyName(String name) { if (name == null || name.isBlank()) throw invalid("企业账号必须填写企业名称"); return name.trim(); }
    private static BusinessApiException emailExists() { return new BusinessApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该邮箱已注册，已删除账号的邮箱也会保留"); }
    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }
    private static BusinessApiException notFound() { return new BusinessApiException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "账号不存在或不属于可管理的个人、企业账号"); }
    private static Account map(ResultSet rs, int row) throws SQLException {
        var lastLogin = rs.getTimestamp("last_login_at");
        return new Account(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("display_name"),
                rs.getString("account_type"), rs.getString("account_status"), rs.getObject("company_id", UUID.class),
                rs.getString("company_name"), rs.getString("certification_status"), rs.getLong("material_count"),
                rs.getLong("case_count"), rs.getLong("balance"), rs.getTimestamp("created_at").toInstant(), lastLogin == null ? null : lastLogin.toInstant());
    }
}

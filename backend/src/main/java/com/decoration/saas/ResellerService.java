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
import java.nio.charset.StandardCharsets;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static com.decoration.saas.ResellerDtos.*;

@Service
public class ResellerService {
    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public ResellerService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<ResellerPartner> list() {
        return jdbc.query("""
                select p.id, p.code, p.name, p.contact_name, p.contact_info, p.status, u.email as login_email,
                       p.created_at, p.updated_at,
                       (select count(*) from company_reseller_links l where l.reseller_id = p.id) as company_count
                from reseller_partners p left join auth_users u on u.id = p.owner_user_id
                order by p.created_at desc, p.id
                """, (rs, row) -> new ResellerPartner(rs.getObject("id", UUID.class), rs.getString("code"),
                rs.getString("name"), rs.getString("contact_name"), rs.getString("contact_info"), rs.getString("status"),
                rs.getString("login_email"), rs.getLong("company_count"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant()));
    }

    public List<AdminAssignableCompany> listAssignableCompanies() {
        return jdbc.query("""
                select id, name
                from auth_companies
                order by lower(name), id
                """, (rs, row) -> new AdminAssignableCompany(
                rs.getObject("id", UUID.class), rs.getString("name")));
    }

    @Transactional
    public ResellerPartner create(CreateResellerRequest request) {
        if (request.initialPassword().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "初始密码不能超过 72 个 UTF-8 字节");
        }
        var id = UUID.randomUUID();
        var userId = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        try {
            jdbc.update("""
                    insert into auth_users(id, email, password_hash, display_name, account_type, company_id, role, created_at)
                    values (?, lower(trim(?)), ?, ?, 'PERSONAL', null, 'RESELLER_ADMIN', ?)
                    """, userId, request.loginEmail(), passwordEncoder.encode(request.initialPassword()),
                    request.contactName() == null || request.contactName().isBlank() ? request.name().trim() : request.contactName().trim(), now);
            jdbc.update("""
                    insert into reseller_partners(id, code, name, contact_name, contact_info, owner_user_id, created_at, updated_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?)
                    """, id, request.code().trim(), request.name().trim(), clean(request.contactName()),
                    clean(request.contactInfo()), userId, now, now);
        } catch (org.springframework.dao.DuplicateKeyException exception) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "DUPLICATE_RESELLER_OR_ACCOUNT",
                    "代理编码或登录邮箱已存在");
        }
        return list().stream().filter(item -> item.id().equals(id)).findFirst().orElseThrow();
    }

    public ResellerDashboard dashboard(UUID userId) {
        var partners = jdbc.query("""
                select id, code, name, contact_name, contact_info, status, created_at, updated_at from reseller_partners
                where owner_user_id = ?
                """, (rs, row) -> new PartnerRef(rs.getObject("id", UUID.class), rs.getString("code"),
                rs.getString("name"), rs.getString("contact_name"), rs.getString("contact_info"), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant()), userId);
        if (partners.isEmpty()) throw new BusinessApiException(HttpStatus.FORBIDDEN, "RESELLER_NOT_ASSIGNED", "代理账号尚未关联代理资料");
        var partner = partners.getFirst();
        if (!"ACTIVE".equals(partner.status())) throw new BusinessApiException(HttpStatus.FORBIDDEN, "RESELLER_SUSPENDED", "代理账号已暂停");
        var companies = jdbc.query("""
                select c.id, c.name, account.email,
                       coalesce(cert.status, 'NOT_SUBMITTED') as certification_status,
                       plan.name as plan_name, subscription.status as subscription_status,
                       subscription.expires_at,
                       (select count(*) from material_quotes m where m.company_id = c.id) as material_count,
                       coalesce(plan.material_limit, 0) as material_limit,
                       (select count(*) from business_cases bc where bc.company_id = c.id) as case_count,
                       coalesce(plan.case_limit, 0) as case_limit,
                       coalesce((select sum(usage.units) from saas_usage_ledger usage
                                 where usage.company_id = c.id and usage.usage_type = 'AI_GENERATION'), 0) as generation_used,
                       coalesce(plan.generation_quota, 0) as generation_quota,
                       link.assigned_at
                from company_reseller_links link
                join auth_companies c on c.id = link.company_id
                left join auth_users account on account.company_id = c.id and account.role = 'COMPANY_ADMIN'
                left join company_certifications cert on cert.company_id = c.id
                left join company_subscriptions subscription on subscription.company_id = c.id
                left join saas_plans plan on plan.id = subscription.plan_id
                where link.reseller_id = ?
                order by c.name, c.id
                """, (rs, row) -> new ResellerDashboardCompany(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getString("email"), rs.getString("certification_status"), rs.getString("plan_name"),
                rs.getString("subscription_status"), rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant(),
                rs.getLong("material_count"), rs.getInt("material_limit"), rs.getLong("case_count"), rs.getInt("case_limit"),
                rs.getLong("generation_used"), rs.getInt("generation_quota"), rs.getTimestamp("assigned_at").toInstant()), partner.id());
        var activeSubscriptions = companies.stream().filter(item -> "ACTIVE".equals(item.subscriptionStatus())
                || "TRIALING".equals(item.subscriptionStatus())).count();
        var expiredSubscriptions = companies.stream().filter(item -> "EXPIRED".equals(item.subscriptionStatus())
                || (item.subscriptionStatus() == null && item.planName() == null)).count();
        var reseller = jdbc.queryForObject("select email from auth_users where id = ?", String.class, userId);
        return new ResellerDashboard(new ResellerPartner(partner.id(), partner.code(), partner.name(), partner.contactName(),
                partner.contactInfo(), partner.status(), reseller, companies.size(), partner.createdAt(), partner.updatedAt()),
                companies.size(), activeSubscriptions, expiredSubscriptions, companies);
    }

    public ResellerCompany forCompany(UUID companyId) {
        var rows = jdbc.query("""
                select c.id as company_id, c.name as company_name, p.id as reseller_id,
                       p.code as reseller_code, p.name as reseller_name, p.status,
                       l.assigned_at, l.updated_at
                from auth_companies c
                join company_reseller_links l on l.company_id = c.id
                join reseller_partners p on p.id = l.reseller_id
                where c.id = ?
                """, (rs, row) -> new ResellerCompany(rs.getObject("company_id", UUID.class), rs.getString("company_name"),
                rs.getObject("reseller_id", UUID.class), rs.getString("reseller_code"), rs.getString("reseller_name"),
                rs.getString("status"), rs.getTimestamp("assigned_at").toInstant(), rs.getTimestamp("updated_at").toInstant()), companyId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    @Transactional
    public ResellerCompany assign(UUID resellerId, UUID companyId) {
        ensureReseller(resellerId);
        ensureCompany(companyId);
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into company_reseller_links(company_id, reseller_id, assigned_at, updated_at)
                values (?, ?, ?, ?)
                on conflict (company_id) do update set reseller_id = excluded.reseller_id, updated_at = excluded.updated_at
                """, companyId, resellerId, now, now);
        return forCompany(companyId);
    }

    @Transactional
    public void unassign(UUID resellerId, UUID companyId) {
        ensureReseller(resellerId);
        jdbc.update("delete from company_reseller_links where company_id = ? and reseller_id = ?", companyId, resellerId);
    }

    private void ensureReseller(UUID resellerId) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from reseller_partners where id = ?)", Boolean.class, resellerId))) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "代理不存在");
        }
    }

    private void ensureCompany(UUID companyId) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from auth_companies where id = ?)", Boolean.class, companyId))) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "企业不存在");
        }
    }

    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record PartnerRef(UUID id, String code, String name, String contactName, String contactInfo, String status,
                              Instant createdAt, Instant updatedAt) { }
}

package com.decoration.saas;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import com.decoration.shared.api.BusinessApiException;
import org.springframework.beans.factory.annotation.Value;
import java.util.Optional;

import static com.decoration.saas.SaasDtos.*;

@Service
public class SaasSubscriptionService {
    private final JdbcTemplate jdbc;
    private final boolean sandboxPaymentsEnabled;

    public SaasSubscriptionService(JdbcTemplate jdbc,
                                   @Value("${app.saas.sandbox-payments-enabled:false}") boolean sandboxPaymentsEnabled) {
        this.jdbc = jdbc;
        this.sandboxPaymentsEnabled = sandboxPaymentsEnabled;
    }

    @Transactional
    public Subscription getOrCreate(UUID companyId) {
        var existing = find(companyId);
        if (existing == null) {
            var plan = jdbc.query("select id, trial_days from saas_plans where code = 'TRIAL' and active = true",
                    (rs, row) -> new TrialPlan(rs.getObject("id", UUID.class), rs.getInt("trial_days")));
            if (plan.isEmpty()) throw new IllegalStateException("TRIAL SaaS plan is missing");
            var now = Instant.now();
            var expires = now.plusSeconds(plan.getFirst().trialDays() * 86_400L);
            jdbc.update("""
                    insert into company_subscriptions(company_id, plan_id, status, started_at, expires_at, trial_ends_at)
                    values (?, ?, 'TRIALING', ?, ?, ?)
                    on conflict (company_id) do nothing
                    """, companyId, plan.getFirst().id(), Timestamp.from(now), Timestamp.from(expires), Timestamp.from(expires));
            existing = find(companyId);
        }
        if (existing == null) throw new IllegalStateException("Unable to initialize company subscription");
        if ((existing.status() == SubscriptionStatus.TRIALING || existing.status() == SubscriptionStatus.ACTIVE)
                && existing.expiresAt().isBefore(Instant.now())) {
            jdbc.update("update company_subscriptions set status = 'EXPIRED', version = version + 1, updated_at = ? where company_id = ? and version = ?",
                    Timestamp.from(Instant.now()), companyId, existing.version());
            existing = find(companyId);
        }
        return existing;
    }

    public void requireCaseCapacity(UUID companyId) {
        if (!isKnownCompany(companyId)) return;
        var subscription = getOrCreate(companyId);
        requireActive(subscription);
        if (subscription.caseLimit() > 0 && subscription.caseCount() >= subscription.caseLimit()) {
            throw limitReached("案例", subscription.caseLimit());
        }
    }

    public void requireMaterialCapacity(UUID companyId) {
        if (!isKnownCompany(companyId)) return;
        var subscription = getOrCreate(companyId);
        requireActive(subscription);
        if (subscription.materialLimit() > 0 && subscription.materialCount() >= subscription.materialLimit()) {
            throw limitReached("材料报价", subscription.materialLimit());
        }
    }

    @Transactional
    public void reserveGenerationUsage(UUID companyId, UUID referenceId, long units) {
        if (units <= 0 || !isKnownCompany(companyId)) return;
        var subscription = getOrCreate(companyId);
        requireActive(subscription);
        var key = "generation:" + referenceId;
        var alreadyReserved = jdbc.queryForObject("""
                select exists(select 1 from saas_usage_ledger where subscription_id = ? and idempotency_key = ?)
                """, Boolean.class, subscription.id(), key);
        if (Boolean.TRUE.equals(alreadyReserved)) return;

        // Serialize reservations for the same subscription so concurrent task creation
        // cannot consume more than the plan quota.
        jdbc.queryForObject("select id from company_subscriptions where id = ? for update", UUID.class, subscription.id());
        var used = jdbc.queryForObject("""
                select coalesce(sum(units), 0) from saas_usage_ledger
                where subscription_id = ? and usage_type = 'AI_GENERATION'
                """, Long.class, subscription.id());
        if (subscription.generationQuota() > 0 && used + units > subscription.generationQuota()) {
            throw limitReached("AI 生图", subscription.generationQuota());
        }
        jdbc.update("""
                insert into saas_usage_ledger(subscription_id, company_id, usage_type, units, reference_id, idempotency_key)
                values (?, ?, 'AI_GENERATION', ?, ?, ?)
                on conflict (subscription_id, idempotency_key) do nothing
                """, subscription.id(), companyId, units, referenceId, key);
    }

    @Transactional
    public void recordGenerationUsage(UUID companyId, UUID referenceId, long units) {
        if (units <= 0 || !isKnownCompany(companyId)) return;
        var subscription = getOrCreate(companyId);
        var key = "generation:" + referenceId;
        var alreadyRecorded = jdbc.queryForObject("""
                select exists(select 1 from saas_usage_ledger where subscription_id = ? and idempotency_key = ?)
                """, Boolean.class, subscription.id(), key);
        if (Boolean.TRUE.equals(alreadyRecorded)) return;
        jdbc.update("""
                insert into saas_usage_ledger(subscription_id, company_id, usage_type, units, reference_id, idempotency_key)
                values (?, ?, 'AI_GENERATION', ?, ?, ?)
                on conflict (subscription_id, idempotency_key) do nothing
                """, subscription.id(), companyId, units, referenceId, key);
    }

    @Transactional
    public void releaseGenerationUsage(UUID companyId, UUID referenceId) {
        if (referenceId == null || !isKnownCompany(companyId)) return;
        var subscription = find(companyId);
        if (subscription == null) return;
        jdbc.update("delete from saas_usage_ledger where subscription_id = ? and idempotency_key = ?",
                subscription.id(), "generation:" + referenceId);
    }

    public UsageSummary generationUsage(UUID companyId) {
        var subscription = getOrCreate(companyId);
        var entries = jdbc.query("""
                select id, usage_type, units, reference_id, created_at
                from saas_usage_ledger
                where subscription_id = ? and usage_type = 'AI_GENERATION'
                order by created_at desc, id desc limit 50
                """, (rs, row) -> new UsageEntry(rs.getObject("id", UUID.class), rs.getString("usage_type"),
                rs.getLong("units"), rs.getObject("reference_id", UUID.class), rs.getTimestamp("created_at").toInstant()),
                subscription.id());
        var remaining = subscription.generationQuota() > 0
                ? Math.max(0, subscription.generationQuota() - subscription.generationUsed())
                : Long.MAX_VALUE;
        return new UsageSummary(subscription.id(), subscription.generationUsed(), subscription.generationQuota(), remaining, entries);
    }

    public List<Plan> listPlans() {
        return jdbc.query("""
                select code, name, generation_quota, storage_limit_bytes, material_limit, case_limit, monthly_price_cents
                from saas_plans where active = true and code <> 'TRIAL' order by monthly_price_cents, code
                """, (rs, row) -> new Plan(rs.getString("code"), rs.getString("name"), rs.getInt("generation_quota"),
                rs.getLong("storage_limit_bytes"), rs.getInt("material_limit"), rs.getInt("case_limit"),
                rs.getLong("monthly_price_cents")));
    }

    @Transactional
    public SubscriptionOrder createOrder(UUID companyId, CreateOrderRequest request, String idempotencyKey) {
        ensureCompany(companyId);
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 120) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "请提供有效的 Idempotency-Key");
        }
        var existing = findOrder(companyId, idempotencyKey.trim());
        if (existing != null) return existing;
        var planCode = request.planCode().trim().toUpperCase(Locale.ROOT);
        var plan = jdbc.query("select id, code, name, monthly_price_cents from saas_plans where code = ? and active = true",
                (rs, row) -> new OrderPlan(rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"), rs.getLong("monthly_price_cents")), planCode);
        if (plan.isEmpty() || "TRIAL".equals(plan.getFirst().code())) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "PLAN_NOT_AVAILABLE", "所选套餐不可购买");
        }
        var id = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        var orderNo = "SO" + java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
                .withZone(java.time.ZoneOffset.UTC).format(now.toInstant()) + id.toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
        jdbc.update("""
                insert into saas_orders(id, order_no, company_id, plan_id, idempotency_key, amount_cents, payment_channel, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, 'SANDBOX', ?, ?)
                """, id, orderNo, companyId, plan.getFirst().id(), idempotencyKey.trim(), plan.getFirst().amountCents(), now, now);
        return findOrder(id).orElseThrow();
    }

    public List<SubscriptionOrder> listOrders(UUID companyId) {
        ensureCompany(companyId);
        return jdbc.query(orderSql() + " where o.company_id = ? order by o.created_at desc, o.id desc limit 50",
                this::mapOrder, companyId);
    }

    public List<AdminSubscriptionOrder> listPendingOrders() {
        return jdbc.query("""
                select o.id, o.order_no, o.company_id, c.name as company_name, p.code, p.name,
                       o.amount_cents, o.status, o.payment_channel, o.created_at, o.paid_at
                from saas_orders o
                join auth_companies c on c.id = o.company_id
                join saas_plans p on p.id = o.plan_id
                where o.status = 'PENDING'
                order by o.created_at, o.id limit 200
                """, (rs, row) -> new AdminSubscriptionOrder(rs.getObject("id", UUID.class), rs.getString("order_no"),
                rs.getObject("company_id", UUID.class), rs.getString("company_name"), rs.getString("code"), rs.getString("name"),
                rs.getLong("amount_cents"), OrderStatus.valueOf(rs.getString("status")), rs.getString("payment_channel"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("paid_at") == null ? null : rs.getTimestamp("paid_at").toInstant()));
    }

    @Transactional
    public Subscription confirmSandbox(UUID orderId) {
        if (!sandboxPaymentsEnabled) throw new BusinessApiException(HttpStatus.CONFLICT, "SANDBOX_PAYMENT_DISABLED", "沙箱支付未启用");
        var order = findOrder(orderId).orElseThrow(() -> new BusinessApiException(HttpStatus.NOT_FOUND, "ORDER_NOT_FOUND", "订单不存在"));
        if (order.status() == OrderStatus.PAID) return getOrCreate(orderCompany(orderId));
        if (order.status() != OrderStatus.PENDING) throw new BusinessApiException(HttpStatus.CONFLICT, "ORDER_NOT_PAYABLE", "订单当前不可支付");
        var now = Timestamp.from(Instant.now());
        jdbc.update("update saas_orders set status = 'PAID', paid_at = ?, updated_at = ? where id = ? and status = 'PENDING'", now, now, orderId);
        var planId = jdbc.queryForObject("select plan_id from saas_orders where id = ?", UUID.class, orderId);
        var companyId = orderCompany(orderId);
        var currentSubscription = jdbc.query("select started_at, expires_at from company_subscriptions where company_id = ? for update",
                (rs, row) -> new SubscriptionWindow(rs.getTimestamp("started_at").toInstant(), rs.getTimestamp("expires_at").toInstant()), companyId)
                .stream().findFirst().orElse(null);
        var extensionBase = currentSubscription == null || !currentSubscription.expiresAt().isAfter(now.toInstant())
                ? now.toInstant() : currentSubscription.expiresAt();
        var startedAt = currentSubscription == null || !currentSubscription.expiresAt().isAfter(now.toInstant())
                ? now.toInstant() : currentSubscription.startedAt();
        var expiresAt = extensionBase.plusSeconds(30L * 86_400L);
        jdbc.update("""
                insert into company_subscriptions(company_id, plan_id, status, started_at, expires_at, trial_ends_at, version, created_at, updated_at)
                values (?, ?, 'ACTIVE', ?, ?, null, 0, ?, ?)
                on conflict (company_id) do update set plan_id = excluded.plan_id, status = 'ACTIVE',
                    started_at = excluded.started_at, expires_at = excluded.expires_at, trial_ends_at = null,
                    version = company_subscriptions.version + 1, updated_at = excluded.updated_at
                """, companyId, planId, Timestamp.from(startedAt), Timestamp.from(expiresAt), now, now);
        return getOrCreate(companyId);
    }

    private void ensureCompany(UUID companyId) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from auth_companies where id = ?)", Boolean.class, companyId))) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "COMPANY_NOT_FOUND", "企业不存在");
        }
    }

    private String orderSql() {
        return "select o.id, o.order_no, p.code, p.name, o.amount_cents, o.status, o.payment_channel, o.created_at, o.paid_at from saas_orders o join saas_plans p on p.id = o.plan_id";
    }

    private SubscriptionOrder mapOrder(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new SubscriptionOrder(rs.getObject("id", UUID.class), rs.getString("order_no"), rs.getString("code"), rs.getString("name"),
                rs.getLong("amount_cents"), OrderStatus.valueOf(rs.getString("status")), rs.getString("payment_channel"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("paid_at") == null ? null : rs.getTimestamp("paid_at").toInstant());
    }

    private Optional<SubscriptionOrder> findOrder(UUID id) {
        var rows = jdbc.query(orderSql() + " where o.id = ?", this::mapOrder, id);
        return rows.stream().findFirst();
    }

    private SubscriptionOrder findOrder(UUID companyId, String key) {
        var rows = jdbc.query(orderSql() + " where o.company_id = ? and o.idempotency_key = ?", this::mapOrder, companyId, key);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private UUID orderCompany(UUID orderId) {
        return jdbc.queryForObject("select company_id from saas_orders where id = ?", UUID.class, orderId);
    }

    private static void requireActive(Subscription subscription) {
        if (subscription.status() == SubscriptionStatus.EXPIRED || subscription.status() == SubscriptionStatus.CANCELLED) {
            throw new com.decoration.shared.api.BusinessApiException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "SUBSCRIPTION_INACTIVE",
                    "当前企业订阅已过期或已取消，请联系平台续订后再继续添加资料");
        }
    }

    private boolean isKnownCompany(UUID companyId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from auth_companies where id = ?)", Boolean.class, companyId));
    }

    private static com.decoration.shared.api.BusinessApiException limitReached(String resource, int limit) {
        return new com.decoration.shared.api.BusinessApiException(
                org.springframework.http.HttpStatus.CONFLICT,
                "SUBSCRIPTION_LIMIT_REACHED",
                "当前套餐最多添加 " + limit + " 条" + resource + "，请升级套餐后继续添加");
    }

    private Subscription find(UUID companyId) {
        var rows = jdbc.query("""
                select s.id, s.company_id, p.code, p.name, s.status, s.started_at, s.expires_at, s.trial_ends_at,
                       p.generation_quota, p.storage_limit_bytes, p.material_limit, p.case_limit,
                       s.version, s.updated_at,
                       (select count(*) from material_quotes m where m.company_id = s.company_id) as material_count,
                       (select count(*) from business_cases c where c.company_id = s.company_id) as case_count,
                       (select coalesce(sum(u.units), 0) from saas_usage_ledger u
                        where u.subscription_id = s.id and u.usage_type = 'AI_GENERATION') as generation_used
                from company_subscriptions s join saas_plans p on p.id = s.plan_id
                where s.company_id = ?
                """, (rs, row) -> new Subscription(
                rs.getObject("id", UUID.class), rs.getObject("company_id", UUID.class), rs.getString("code"),
                rs.getString("name"), SubscriptionStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("started_at").toInstant(), rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("trial_ends_at") == null ? null : rs.getTimestamp("trial_ends_at").toInstant(),
                rs.getInt("generation_quota"), rs.getLong("storage_limit_bytes"), rs.getInt("material_limit"),
                rs.getInt("case_limit"), rs.getLong("material_count"), rs.getLong("case_count"), rs.getLong("generation_used"),
                rs.getInt("version"), rs.getTimestamp("updated_at").toInstant()), companyId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private record TrialPlan(UUID id, int trialDays) { }
    private record OrderPlan(UUID id, String code, String name, long amountCents) { }
    private record SubscriptionWindow(Instant startedAt, Instant expiresAt) { }
}

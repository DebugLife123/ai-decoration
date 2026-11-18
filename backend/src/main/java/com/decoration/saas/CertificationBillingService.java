package com.decoration.saas;

import com.decoration.business.AdminAuditLogService;
import com.decoration.business.BusinessAssetService;
import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static com.decoration.saas.CertificationBillingDtos.*;

@Service
public class CertificationBillingService {
    private static final String CONFIG_KEY = "DEFAULT";
    private static final DateTimeFormatter ORDER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(ZoneOffset.UTC);

    private final JdbcTemplate jdbc;
    private final AdminAuditLogService auditLogService;
    private final BusinessAssetService assetService;

    public CertificationBillingService(JdbcTemplate jdbc, AdminAuditLogService auditLogService,
                                       BusinessAssetService assetService) {
        this.jdbc = jdbc;
        this.auditLogService = auditLogService;
        this.assetService = assetService;
    }

    public BillingSummary summary(UUID companyId) {
        var company = company(companyId);
        var fee = feeConfig();
        var latest = latestOrder(companyId);
        if (company.demo()) return new BillingSummary(fee.amountCents(), true, true, "演示企业无需缴纳认证费", latest);
        if (fee.amountCents() == 0) return new BillingSummary(0, true, true, "当前认证费用为 0", latest);
        if (latest != null && latest.status() == PaymentStatus.PAID && "LEGACY".equals(latest.paymentChannel())) {
            return new BillingSummary(fee.amountCents(), true, true, "历史认证已保留，无需重复缴费", latest);
        }
        var paid = hasPaidOrder(companyId);
        return new BillingSummary(fee.amountCents(), paid, false, null, latest);
    }

    public FeeConfig feeConfig() {
        return jdbc.queryForObject("select amount_cents, updated_by, updated_at from certification_fee_config where config_key = ?",
                (rs, row) -> new FeeConfig(rs.getLong("amount_cents"), rs.getObject("updated_by", UUID.class),
                        rs.getTimestamp("updated_at").toInstant()), CONFIG_KEY);
    }

    @Transactional
    public FeeConfig updateFee(UUID adminId, long amountCents) {
        if (amountCents < 0 || amountCents > 100_000_000) throw invalid("认证费用必须在 0 到 100 万元之间");
        jdbc.update("update certification_fee_config set amount_cents = ?, updated_by = ?, updated_at = now() where config_key = ?",
                amountCents, adminId, CONFIG_KEY);
        auditLogService.record(adminId, "CERTIFICATION_FEE_UPDATE", "CERTIFICATION_FEE", null,
                "认证费用调整为 ¥" + String.format(Locale.ROOT, "%.2f", amountCents / 100.0));
        return feeConfig();
    }

    @Transactional
    public PaymentOrder createOrder(UUID companyId, String idempotencyKey) {
        var company = companyForUpdate(companyId);
        var key = cleanKey(idempotencyKey);
        var existing = findByKey(companyId, key);
        if (existing != null) return existing;
        var fee = feeConfig();
        if (company.demo() || fee.amountCents() == 0 || hasPaidOrder(companyId)) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_PAYMENT_NOT_REQUIRED", "当前企业无需创建认证缴费单");
        }
        var pending = pendingOrder(companyId);
        if (pending != null) return pending;
        var id = UUID.randomUUID();
        var now = Instant.now();
        var orderNo = "CO" + ORDER_TIME.format(now) + id.toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
        jdbc.update("""
                insert into certification_payment_orders(
                    id, order_no, company_id, idempotency_key, amount_cents, status, payment_channel, created_at, updated_at
                ) values (?, ?, ?, ?, ?, 'PENDING', 'MANUAL', ?, ?)
                """, id, orderNo, companyId, key, fee.amountCents(), Timestamp.from(now), Timestamp.from(now));
        return findById(id);
    }

    public List<PaymentOrder> listOrders(PaymentStatus status) {
        var where = status == null ? "" : " where o.status = ?";
        var sql = orderSql() + where + " order by o.created_at desc, o.id desc limit 500";
        return status == null ? jdbc.query(sql, this::mapOrder) : jdbc.query(sql, this::mapOrder, status.name());
    }

    @Transactional
    public PaymentOrder submitProof(UUID companyId, UUID orderId, UUID proofAssetId, String payerNote) {
        var order = lockOwnedOrder(companyId, orderId);
        if (order.status() != PaymentStatus.PENDING) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_ORDER_NOT_PAYABLE", "认证缴费单当前不能提交付款凭证");
        }
        var asset = assetService.get(companyId, proofAssetId);
        if (!asset.mediaType().startsWith("image/")) {
            throw invalid("付款凭证仅支持 JPG、PNG、WEBP、GIF 或 BMP 图片");
        }
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                update certification_payment_orders
                set proof_asset_id = ?, payer_note = ?, proof_submitted_at = ?, proof_status = 'SUBMITTED',
                    proof_rejection_reason = null, proof_reviewed_by = null, proof_reviewed_at = null, updated_at = ?
                where id = ? and company_id = ? and status = 'PENDING'
                """, proofAssetId, cleanPayerNote(payerNote), now, now, orderId, companyId);
        return findById(orderId);
    }

    public BusinessAssetService.StoredBusinessAsset proof(UUID orderId) {
        var order = findById(orderId);
        if (order.proofAssetId() == null) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "CERTIFICATION_PAYMENT_PROOF_NOT_FOUND", "付款凭证尚未提交");
        }
        return assetService.get(order.companyId(), order.proofAssetId());
    }

    @Transactional
    public PaymentOrder confirm(UUID adminId, UUID orderId, String paymentReference, String note) {
        var order = lockOrder(orderId);
        if (order.status() == PaymentStatus.PAID) return order;
        if (order.status() != PaymentStatus.PENDING) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_ORDER_NOT_PAYABLE", "认证缴费单当前不可确认");
        }
        if (order.proofAssetId() == null) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_PAYMENT_PROOF_REQUIRED", "企业尚未提交付款凭证，不能确认收款");
        }
        if (order.proofStatus() != ProofStatus.SUBMITTED) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_PAYMENT_PROOF_REQUIRED", "付款凭证已被驳回，请等待企业重新提交");
        }
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                update certification_payment_orders
                set status = 'PAID', payment_reference = ?, note = ?, confirmed_by = ?, paid_at = ?,
                    proof_reviewed_by = ?, proof_reviewed_at = ?, updated_at = ?
                where id = ? and status = 'PENDING'
                """, cleanPaymentReference(paymentReference), cleanNote(note), adminId, now, adminId, now, now, orderId);
        auditLogService.record(adminId, "CERTIFICATION_PAYMENT_CONFIRM", "COMPANY", order.companyId(),
                "确认企业认证费收款：" + order.orderNo());
        return findById(orderId);
    }

    @Transactional
    public PaymentOrder rejectProof(UUID adminId, UUID orderId, String reason) {
        var order = lockOrder(orderId);
        if (order.status() != PaymentStatus.PENDING || order.proofAssetId() == null
                || order.proofStatus() != ProofStatus.SUBMITTED) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_PAYMENT_PROOF_NOT_REVIEWABLE", "付款凭证当前不可驳回");
        }
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                update certification_payment_orders
                set proof_status = 'REJECTED', proof_rejection_reason = ?, proof_reviewed_by = ?,
                    proof_reviewed_at = ?, updated_at = ?
                where id = ? and status = 'PENDING' and proof_status = 'SUBMITTED'
                """, cleanRejectionReason(reason), adminId, now, now, orderId);
        auditLogService.record(adminId, "CERTIFICATION_PAYMENT_PROOF_REJECT", "COMPANY", order.companyId(),
                "驳回企业认证付款凭证：" + order.orderNo());
        return findById(orderId);
    }

    public void requirePaid(UUID companyId) {
        var result = summary(companyId);
        if (result.eligible()) return;
        if (result.latestOrder() != null && result.latestOrder().status() == PaymentStatus.PENDING) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_PAYMENT_PENDING", "认证费用正在等待平台确认收款，确认后即可提交认证资料");
        }
        throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_PAYMENT_REQUIRED", "请先创建认证缴费单，并等待平台确认收款");
    }

    private CompanyInfo company(UUID companyId) {
        var rows = jdbc.query("select id, name, is_demo from auth_companies where id = ?",
                (rs, row) -> new CompanyInfo(rs.getObject("id", UUID.class), rs.getString("name"), rs.getBoolean("is_demo")), companyId);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "COMPANY_NOT_FOUND", "企业不存在");
        return rows.getFirst();
    }

    private CompanyInfo companyForUpdate(UUID companyId) {
        var rows = jdbc.query("select id, name, is_demo from auth_companies where id = ? for update",
                (rs, row) -> new CompanyInfo(rs.getObject("id", UUID.class), rs.getString("name"), rs.getBoolean("is_demo")), companyId);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "COMPANY_NOT_FOUND", "企业不存在");
        return rows.getFirst();
    }

    private boolean hasPaidOrder(UUID companyId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from certification_payment_orders where company_id = ? and status = 'PAID')", Boolean.class, companyId));
    }

    private PaymentOrder latestOrder(UUID companyId) {
        var rows = jdbc.query(orderSql() + " where o.company_id = ? order by o.created_at desc, o.id desc limit 1", this::mapOrder, companyId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private PaymentOrder pendingOrder(UUID companyId) {
        var rows = jdbc.query(orderSql() + " where o.company_id = ? and o.status = 'PENDING' order by o.created_at desc limit 1", this::mapOrder, companyId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private PaymentOrder findByKey(UUID companyId, String key) {
        var rows = jdbc.query(orderSql() + " where o.company_id = ? and o.idempotency_key = ?", this::mapOrder, companyId, key);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private PaymentOrder findById(UUID id) {
        var rows = jdbc.query(orderSql() + " where o.id = ?", this::mapOrder, id);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "CERTIFICATION_ORDER_NOT_FOUND", "认证缴费单不存在");
        return rows.getFirst();
    }

    private PaymentOrder lockOrder(UUID id) {
        var rows = jdbc.query(orderSql() + " where o.id = ? for update of o", this::mapOrder, id);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "CERTIFICATION_ORDER_NOT_FOUND", "认证缴费单不存在");
        return rows.getFirst();
    }

    private PaymentOrder lockOwnedOrder(UUID companyId, UUID id) {
        var rows = jdbc.query(orderSql() + " where o.company_id = ? and o.id = ? for update of o", this::mapOrder, companyId, id);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "CERTIFICATION_ORDER_NOT_FOUND", "认证缴费单不存在");
        return rows.getFirst();
    }

    private String orderSql() {
        return """
                select o.id, o.order_no, o.company_id, c.name as company_name, o.amount_cents, o.status,
                       o.payment_channel, o.proof_asset_id, a.file_name as proof_file_name, o.payer_note,
                       o.proof_submitted_at, o.proof_status, o.proof_rejection_reason, o.proof_reviewed_by,
                       o.proof_reviewed_at, o.payment_reference, o.note, o.confirmed_by, o.created_at, o.paid_at
                from certification_payment_orders o
                join auth_companies c on c.id = o.company_id
                left join business_assets a on a.company_id = o.company_id and a.id = o.proof_asset_id
                """;
    }

    private PaymentOrder mapOrder(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        var paidAt = rs.getTimestamp("paid_at");
        var proofSubmittedAt = rs.getTimestamp("proof_submitted_at");
        var proofReviewedAt = rs.getTimestamp("proof_reviewed_at");
        return new PaymentOrder(rs.getObject("id", UUID.class), rs.getString("order_no"),
                rs.getObject("company_id", UUID.class), rs.getString("company_name"), rs.getLong("amount_cents"),
                PaymentStatus.valueOf(rs.getString("status")), rs.getString("payment_channel"),
                rs.getObject("proof_asset_id", UUID.class), rs.getString("proof_file_name"), rs.getString("payer_note"),
                proofSubmittedAt == null ? null : proofSubmittedAt.toInstant(), ProofStatus.valueOf(rs.getString("proof_status")),
                rs.getString("proof_rejection_reason"), rs.getObject("proof_reviewed_by", UUID.class),
                proofReviewedAt == null ? null : proofReviewedAt.toInstant(), rs.getString("payment_reference"), rs.getString("note"),
                rs.getObject("confirmed_by", UUID.class), rs.getTimestamp("created_at").toInstant(),
                paidAt == null ? null : paidAt.toInstant());
    }

    private static String cleanKey(String key) {
        if (key == null || key.isBlank() || key.trim().length() < 8 || key.trim().length() > 160) throw invalid("请提供有效的 Idempotency-Key");
        return key.trim();
    }

    private static String cleanPayerNote(String note) {
        if (note == null || note.isBlank() || note.trim().length() > 500) throw invalid("请填写 500 字以内的付款说明");
        return note.trim();
    }
    private static String cleanPaymentReference(String reference) {
        if (reference == null || reference.isBlank() || reference.trim().length() > 120) throw invalid("请填写 120 字以内的付款流水号或收款标识");
        return reference.trim();
    }
    private static String cleanRejectionReason(String reason) {
        if (reason == null || reason.isBlank() || reason.trim().length() > 500) throw invalid("请填写 500 字以内的凭证驳回原因");
        return reason.trim();
    }
    private static String cleanNote(String note) { return note == null || note.isBlank() ? "管理员已核对付款凭证并确认线下收款" : note.trim(); }
    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }
    private record CompanyInfo(UUID id, String name, boolean demo) { }
}

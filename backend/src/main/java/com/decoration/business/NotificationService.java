package com.decoration.business;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static com.decoration.business.NotificationDtos.*;

@Service
public class NotificationService {
    private final JdbcTemplate jdbc;

    public NotificationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public List<Notification> list(UUID recipientId, String recipientRole) {
        var notifications = new ArrayList<Notification>();
        if ("BUSINESS".equals(recipientRole)) {
            // 必须显式指定 ResultSetExtractor，否则 lambda 会匹配到 query(String, RowCallbackHandler, Object...)
            // 重载：该重载返回 void，companyId 恒为 null，通知列表永远为空。
            var companyId = jdbc.query("select company_id from auth_users where id = ?",
                    (ResultSetExtractor<UUID>) rs -> rs.next() ? rs.getObject(1, UUID.class) : null, recipientId);
            if (companyId != null) addBusinessNotifications(notifications, companyId, recipientId);
        }
        if ("PERSONAL".equals(recipientRole)) addPersonalNotifications(notifications, recipientId);
        if ("ADMIN".equals(recipientRole)) addAdminNotifications(notifications, recipientId);
        return notifications.stream().sorted(Comparator.comparing(Notification::createdAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(100).toList();
    }

    @Transactional
    public void markRead(UUID recipientId, String recipientRole, String key) {
        jdbc.update("""
                insert into notification_reads(recipient_id, recipient_role, notification_key, read_at)
                values (?, ?, ?, ?)
                on conflict (recipient_id, recipient_role, notification_key) do update set read_at = excluded.read_at
                """, recipientId, recipientRole, key, Timestamp.from(Instant.now()));
    }

    @Transactional
    public void markAllRead(UUID recipientId, String recipientRole) {
        for (var item : list(recipientId, recipientRole)) markRead(recipientId, recipientRole, item.key());
    }

    private void addBusinessNotifications(List<Notification> target, UUID companyId, UUID recipientId) {
        jdbc.query("""
                select id, order_no, amount_cents, paid_at
                from certification_payment_orders
                where company_id = ? and status = 'PAID' and payment_channel = 'MANUAL'
                order by paid_at desc, id desc limit 50
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var id = rs.getObject("id", UUID.class);
                var amount = rs.getLong("amount_cents") / 100.0;
                target.add(notification(recipientId, "BUSINESS", "certification-payment:" + id,
                        NotificationType.CERTIFICATION_PAYMENT, "认证费用已确认",
                        "缴费单“" + rs.getString("order_no") + "”已确认收款 ¥" + String.format(java.util.Locale.ROOT, "%.2f", amount)
                                + "，现在可以提交认证资料。",
                        "/business?tab=certification", rs.getTimestamp("paid_at")));
            }
            return null;
        }, companyId);

        jdbc.query("""
                select id, order_no, proof_rejection_reason, proof_reviewed_at
                from certification_payment_orders
                where company_id = ? and status = 'PENDING' and proof_status = 'REJECTED'
                order by proof_reviewed_at desc, id desc limit 50
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var id = rs.getObject("id", UUID.class);
                var reviewedAt = rs.getTimestamp("proof_reviewed_at");
                target.add(notification(recipientId, "BUSINESS",
                        "certification-payment-proof-rejected:" + id + ":" + reviewedAt.toInstant(),
                        NotificationType.CERTIFICATION_PAYMENT, "认证付款凭证需要重新提交",
                        "缴费单“" + rs.getString("order_no") + "”的凭证未通过核对。原因："
                                + rs.getString("proof_rejection_reason"),
                        "/business?tab=certification", reviewedAt));
            }
            return null;
        }, companyId);

        // 注意：Spring 6 的 JdbcTemplate 没有 query(String, RowCallbackHandler, Object...) 重载，
        // 传 lambda 会被推导成 ResultSetExtractor，rs 是已定位的 ResultSet 而非游标。
        // 这里统一显式声明 ResultSetExtractor<Void> 并自行循环，避免静默漏读。
        jdbc.query("""
                select status, review_note, version, updated_at
                from company_certifications where company_id = ?
                """, (ResultSetExtractor<Void>) rs -> {
            if (rs.next()) {
                var status = rs.getString("status");
                var version = rs.getInt("version");
                var key = "certification:" + companyId + ":" + version;
                var message = "APPROVED".equals(status) ? "企业认证已通过，企业主页和公开资料可以正常展示。"
                        : "REJECTED".equals(status) ? "企业认证未通过，请查看审核意见并补充资料。" : "企业认证正在审核中。";
                var note = rs.getString("review_note");
                if (note != null && !note.isBlank()) message += " 审核意见：" + note;
                target.add(notification(recipientId, "BUSINESS", key, NotificationType.CERTIFICATION,
                        "企业认证" + ("APPROVED".equals(status) ? "已通过" : "REJECTED".equals(status) ? "需补充资料" : "状态更新"),
                        message, "/business?tab=certification", rs.getTimestamp("updated_at")));
            }
            return null;
        }, companyId);

        jdbc.query("""
                select id, name, review_status, review_note, updated_at
                from material_quotes where company_id = ? and review_status in ('APPROVED', 'REJECTED') and reviewed_at is not null
                order by updated_at desc limit 50
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var id = rs.getObject("id", UUID.class);
                var approved = "APPROVED".equals(rs.getString("review_status"));
                var message = approved ? "材料报价“" + rs.getString("name") + "”已审核通过。"
                        : "材料报价“" + rs.getString("name") + "”未通过审核。";
                var note = rs.getString("review_note");
                if (note != null && !note.isBlank()) message += "审核意见：" + note;
                target.add(notification(recipientId, "BUSINESS", "material-review:" + id + ":" + rs.getTimestamp("updated_at").toInstant(),
                        NotificationType.MATERIAL_REVIEW, approved ? "材料报价审核通过" : "材料报价审核未通过",
                        message, "/business?tab=materials", rs.getTimestamp("updated_at")));
            }
            return null;
        }, companyId);

        jdbc.query("""
                select id, name, valid_until, updated_at from material_quotes
                where company_id = ? and admin_hidden = false and valid_until between current_date and current_date + 30
                union all
                select id, labor_type, valid_until, updated_at from labor_quotes
                where company_id = ? and valid_until between current_date and current_date + 30
                order by valid_until asc
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var id = rs.getObject("id", UUID.class);
                var validUntil = rs.getObject("valid_until", java.time.LocalDate.class);
                var key = "quote-expiring:" + id + ":" + validUntil;
                target.add(notification(recipientId, "BUSINESS", key, NotificationType.QUOTE_EXPIRING,
                        "报价即将到期", "“" + rs.getString(2) + "”将于 " + validUntil + " 到期，请及时更新报价。",
                        "/business?tab=materials", rs.getTimestamp("updated_at")));
            }
            return null;
        }, companyId, companyId);

        jdbc.query("""
                select id, material_name, contact_name, created_at from company_inquiries
                where company_id = ? and status = 'NEW' order by created_at desc limit 50
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var id = rs.getObject("id", UUID.class);
                target.add(notification(recipientId, "BUSINESS", "inquiry:" + id, NotificationType.INQUIRY,
                        "收到新的用户咨询", rs.getString("contact_name") + "正在咨询“" + rs.getString("material_name") + "”。",
                        "/business?tab=inquiries", rs.getTimestamp("created_at")));
            }
            return null;
        }, companyId);
    }

    private void addAdminNotifications(List<Notification> target, UUID adminId) {
        jdbc.query("""
                select o.id, o.order_no, o.amount_cents, o.proof_submitted_at, c.name as company_name
                from certification_payment_orders o
                join auth_companies c on c.id = o.company_id
                where o.status = 'PENDING' and o.proof_status = 'SUBMITTED'
                order by o.proof_submitted_at asc, o.id limit 100
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var id = rs.getObject("id", UUID.class);
                var amount = rs.getLong("amount_cents") / 100.0;
                var submittedAt = rs.getTimestamp("proof_submitted_at");
                target.add(notification(adminId, "ADMIN", "admin-certification-payment:" + id + ":" + submittedAt.toInstant(),
                        NotificationType.ADMIN_PAYMENT, "企业已提交认证付款凭证",
                        "“" + rs.getString("company_name") + "”提交了 " + String.format(java.util.Locale.ROOT, "¥%.2f", amount)
                                + " 的付款凭证，请核对后确认收款。",
                        "/admin/certification-payments", submittedAt));
            }
            return null;
        });

        // 这里同样显式声明 ResultSetExtractor<Void>，不能用单参数 lambda：
        // Spring 6 会把单参数 lambda 推导成 ResultSetExtractor 之外的 void 重载，行为容易悄悄改变。
        jdbc.query("""
                select cc.company_id, coalesce(cc.company_name, ac.name) as company_name, cc.version, cc.submitted_at
                from company_certifications cc join auth_companies ac on ac.id = cc.company_id
                where cc.status = 'PENDING' order by cc.submitted_at asc limit 100
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var companyId = rs.getObject("company_id", UUID.class);
                target.add(notification(adminId, "ADMIN", "admin-review:" + companyId + ":" + rs.getInt("version"), NotificationType.ADMIN_REVIEW,
                        "有新的企业认证待审核", "“" + rs.getString("company_name") + "”提交了认证资料，请及时处理。",
                        "/admin", rs.getTimestamp("submitted_at")));
            }
            return null;
        });

        jdbc.query("""
                select o.id, o.order_no, o.amount_cents, o.created_at, c.name as company_name, p.name as plan_name
                from saas_orders o
                join auth_companies c on c.id = o.company_id
                join saas_plans p on p.id = o.plan_id
                where o.status = 'PENDING'
                order by o.created_at asc, o.id
                limit 100
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var id = rs.getObject("id", UUID.class);
                var amount = rs.getLong("amount_cents") / 100.0;
                target.add(notification(adminId, "ADMIN", "admin-subscription:" + id,
                        NotificationType.ADMIN_SUBSCRIPTION, "有新的 SaaS 订阅订单",
                        "“" + rs.getString("company_name") + "”提交了“" + rs.getString("plan_name")
                                + "”订阅订单，金额 ¥" + String.format(java.util.Locale.ROOT, "%.2f", amount)
                                + "，请及时处理。",
                        "/admin/subscription-orders", rs.getTimestamp("created_at")));
            }
            return null;
        });

        jdbc.query("""
                select m.id, m.name, coalesce(p.name, c.name) company_name, m.updated_at
                from material_quotes m join auth_companies c on c.id = m.company_id
                left join company_profiles p on p.company_id = m.company_id
                where m.review_status = 'PENDING'
                order by m.updated_at asc limit 100
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var id = rs.getObject("id", UUID.class);
                target.add(notification(adminId, "ADMIN", "admin-material-review:" + id + ":" + rs.getTimestamp("updated_at").toInstant(),
                        NotificationType.ADMIN_REVIEW, "有新的材料报价待审核",
                        "“" + rs.getString("company_name") + "”提交了材料报价“" + rs.getString("name") + "”，请核对后决定是否公开。",
                        "/admin/marketplace", rs.getTimestamp("updated_at")));
            }
            return null;
        });
    }

    private void addPersonalNotifications(List<Notification> target, UUID consumerId) {
        jdbc.query("""
                select e.id, e.event_type, e.status, e.content, e.created_at, i.id as inquiry_id, i.material_name
                from company_inquiry_events e
                join company_inquiries i on i.id = e.inquiry_id
                where i.consumer_id = ? and e.actor_type = 'COMPANY'
                  and e.event_type in ('REPLY', 'STATUS_CHANGED')
                order by e.created_at desc, e.id desc limit 100
                """, (ResultSetExtractor<Void>) rs -> {
            while (rs.next()) {
                var eventId = rs.getLong("id");
                var inquiryId = rs.getObject("inquiry_id", UUID.class);
                var materialName = rs.getString("material_name");
                var eventType = rs.getString("event_type");
                var title = "REPLY".equals(eventType) ? "企业回复了你的咨询" : "咨询进度有更新";
                var message = "REPLY".equals(eventType)
                        ? "企业已回复你关于“" + materialName + "”的咨询：" + rs.getString("content")
                        : "你关于“" + materialName + "”的咨询状态已更新为" + statusLabel(rs.getString("status")) + "。";
                target.add(notification(consumerId, "PERSONAL", "inquiry-update:" + inquiryId + ":" + eventId,
                        NotificationType.INQUIRY, title, message, "/inquiries?focus=" + inquiryId,
                        rs.getTimestamp("created_at")));
            }
            return null;
        }, consumerId);
    }

    private static String statusLabel(String status) {
        return switch (status) {
            case "CONTACTED" -> "已联系";
            case "QUOTED" -> "已报价";
            case "CLOSED" -> "已完成";
            default -> "待跟进";
        };
    }

    private Notification notification(UUID recipientId, String role, String key, NotificationType type,
                                      String title, String message, String link, Timestamp createdAt) {
        // 已读状态按用户独立：同一 companyId 下的 ADMIN/EDITOR/VIEWER 各自维护自己已读的通知，
        // notification_reads 的主键 (recipient_id, recipient_role, notification_key) 已经支持这一点。
        var read = Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from notification_reads where recipient_id = ? and recipient_role = ? and notification_key = ?)
                """, Boolean.class, recipientId, role, key));
        return new Notification(key, type, title, message, link, createdAt == null ? null : createdAt.toInstant(), read);
    }
}

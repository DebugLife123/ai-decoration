package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.decoration.business.InquiryDtos.*;

@Service
public class InquiryService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    public InquiryService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    @Transactional
    public CompanyInquiry create(UUID consumerId, String key, CreateInquiryRequest request) {
        var materials = jdbc.query("""
                select m.company_id, m.name
                from material_quotes m
                join company_certifications cert on cert.company_id = m.company_id and cert.status = 'APPROVED'
                where m.id = ? and m.admin_hidden = false and m.review_status = 'APPROVED' and m.valid_until >= current_date
                  and not exists (select 1 from auth_users u where u.company_id = m.company_id and u.role = 'COMPANY_ADMIN' and u.account_status <> 'ACTIVE')
                """, (rs, row) -> new MaterialOwner(rs.getObject("company_id", UUID.class), rs.getString("name")),
                request.materialId());
        if (materials.isEmpty()) throw notFound("材料当前不可咨询");
        var owner = materials.getFirst();
        // 幂等键按消费者个人作用域登记，重放时直接返回首次创建的咨询，不重复打扰企业。
        var id = idempotency.reserve(consumerId, key, "inquiry", request, UUID.randomUUID());
        var replay = jdbc.query("select company_id from company_inquiries where id = ?", (rs, row) -> {
            var company = rs.getObject("company_id", UUID.class);
            return company == null ? null : find(company, id);
        }, id);
        if (!replay.isEmpty()) return replay.getFirst();
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into company_inquiries(id, company_id, consumer_id, material_quote_id, material_name,
                    contact_name, contact_info, message, status, version, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 0, ?, ?)
                """, id, owner.companyId(), consumerId, request.materialId(), owner.materialName(),
                clean(request.contactName()), clean(request.contactInfo()), clean(request.message()), now, now);
        addEvent(id, "CONSUMER", "CREATED", InquiryStatus.NEW, null, now.toInstant());
        return find(owner.companyId(), id);
    }

    @Transactional(readOnly = true)
    public List<CompanyInquiry> list(UUID companyId, InquiryStatus status) {
        var hasStatus = status != null;
        var sql = """
                select id, material_quote_id, material_name, contact_name, contact_info, message,
                    status, version, created_at, updated_at
                from company_inquiries where company_id = ?
                """ + (hasStatus ? " and status = ?" : "") + " order by created_at desc, id limit 500";
        var mapper = (org.springframework.jdbc.core.RowMapper<CompanyInquiry>) (rs, row) -> new CompanyInquiry(
                rs.getObject("id", UUID.class), rs.getObject("material_quote_id", UUID.class), rs.getString("material_name"),
                rs.getString("contact_name"), rs.getString("contact_info"), rs.getString("message"),
                InquiryStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")), List.of());
        var inquiries = hasStatus ? jdbc.query(sql, mapper, companyId, status.name()) : jdbc.query(sql, mapper, companyId);
        return attachEvents(inquiries);
    }

    @Transactional(readOnly = true)
    public List<CompanyInquiry> listForConsumer(UUID consumerId) {
        var inquiries = jdbc.query("""
                select id, material_quote_id, material_name, contact_name, contact_info, message,
                    status, version, created_at, updated_at
                from company_inquiries where consumer_id = ?
                order by updated_at desc, id limit 500
                """, (rs, row) -> new CompanyInquiry(
                rs.getObject("id", UUID.class), rs.getObject("material_quote_id", UUID.class), rs.getString("material_name"),
                rs.getString("contact_name"), rs.getString("contact_info"), rs.getString("message"),
                InquiryStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")), List.of()), consumerId);
        return attachEvents(inquiries);
    }

    @Transactional
    public CompanyInquiry updateStatus(UUID companyId, UUID inquiryId, UpdateInquiryStatusRequest request) {
        // 状态机单向推进：NEW → CONTACTED → QUOTED → CLOSED，不允许回退、跳过或同态重设。
        // 先读当前状态，非法流转返回 409，避免和「版本冲突」共用同一个错误码让人分不清。
        var current = jdbc.query("""
                select status, version from company_inquiries where company_id = ? and id = ?
                """, (org.springframework.jdbc.core.ResultSetExtractor<CurrentStatus>) rs -> rs.next()
                ? new CurrentStatus(InquiryStatus.valueOf(rs.getString("status")), rs.getInt("version"))
                : null, companyId, inquiryId);
        if (current == null) throw notFound("咨询记录不存在");
        var target = request.status();
        if (current.version() != request.version()) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "咨询记录已更新，请刷新后重试");
        }
        if (!allowedNext(current.status()).contains(target)) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "INVALID_STATUS_TRANSITION",
                    "咨询状态只能按 NEW → CONTACTED → QUOTED → CLOSED 顺序推进，当前为 " + current.status());
        }
        var now = Instant.now();
        var updated = jdbc.update("""
                update company_inquiries set status = ?, version = version + 1, updated_at = ?
                where company_id = ? and id = ? and version = ?
                """, target.name(), Timestamp.from(now), companyId, inquiryId, request.version());
        if (updated == 0) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "咨询记录已更新，请刷新后重试");
        }
        addEvent(inquiryId, "COMPANY", "STATUS_CHANGED", target, null, now);
        return find(companyId, inquiryId);
    }

    @Transactional
    public CompanyInquiry reply(UUID companyId, UUID inquiryId, CreateInquiryReplyRequest request) {
        var now = Instant.now();
        var updated = jdbc.update("""
                update company_inquiries set version = version + 1, updated_at = ?
                where company_id = ? and id = ?
                """, Timestamp.from(now), companyId, inquiryId);
        if (updated == 0) throw notFound("咨询记录不存在");
        addEvent(inquiryId, "COMPANY", "REPLY", null, clean(request.content()), now);
        return find(companyId, inquiryId);
    }

    /** 允许的下一个状态；CLOSED 是终态。 */
    private static List<InquiryStatus> allowedNext(InquiryStatus current) {
        return switch (current) {
            case NEW -> List.of(InquiryStatus.CONTACTED);
            case CONTACTED -> List.of(InquiryStatus.QUOTED);
            case QUOTED -> List.of(InquiryStatus.CLOSED);
            case CLOSED -> List.of();
        };
    }

    private record CurrentStatus(InquiryStatus status, int version) { }
    private record EventRow(UUID inquiryId, InquiryEvent event) { }

    private CompanyInquiry find(UUID companyId, UUID inquiryId) {
        var inquiry = jdbc.query("""
                select id, material_quote_id, material_name, contact_name, contact_info, message,
                    status, version, created_at, updated_at
                from company_inquiries where company_id = ? and id = ?
                """, (org.springframework.jdbc.core.ResultSetExtractor<CompanyInquiry>) rs -> rs.next() ? new CompanyInquiry(
                rs.getObject("id", UUID.class), rs.getObject("material_quote_id", UUID.class), rs.getString("material_name"),
                rs.getString("contact_name"), rs.getString("contact_info"), rs.getString("message"),
                InquiryStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")), List.of()) : null,
                companyId, inquiryId);
        return inquiry == null ? null : attachEvents(List.of(inquiry)).getFirst();
    }

    private List<CompanyInquiry> attachEvents(List<CompanyInquiry> inquiries) {
        if (inquiries.isEmpty()) return inquiries;
        var ids = inquiries.stream().map(CompanyInquiry::id).toList();
        var placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        var events = jdbc.query("""
                select id, inquiry_id, actor_type, event_type, status, content, created_at
                from company_inquiry_events where inquiry_id in (%s) order by created_at, id
                """.formatted(placeholders), (rs, row) -> new EventRow(rs.getObject("inquiry_id", UUID.class),
                new InquiryEvent(rs.getLong("id"), rs.getString("actor_type"), rs.getString("event_type"),
                        rs.getString("status") == null ? null : InquiryStatus.valueOf(rs.getString("status")),
                        rs.getString("content"), instant(rs.getTimestamp("created_at")))), ids.toArray());
        var grouped = events.stream().collect(java.util.stream.Collectors.groupingBy(EventRow::inquiryId,
                java.util.stream.Collectors.mapping(EventRow::event, java.util.stream.Collectors.toList())));
        return inquiries.stream().map(item -> new CompanyInquiry(item.id(), item.materialId(), item.materialName(),
                item.contactName(), item.contactInfo(), item.message(), item.status(), item.version(), item.createdAt(),
                item.updatedAt(), grouped.getOrDefault(item.id(), List.of()))).toList();
    }

    private void addEvent(UUID inquiryId, String actor, String type, InquiryStatus status, String content, Instant at) {
        jdbc.update("""
                insert into company_inquiry_events(inquiry_id, actor_type, event_type, status, content, created_at)
                values (?, ?, ?, ?, ?, ?)
                """, inquiryId, actor, type, status == null ? null : status.name(), content, Timestamp.from(at));
    }

    private static Instant instant(Timestamp timestamp) { return timestamp == null ? null : timestamp.toInstant(); }
    private static String clean(String value) { return value.trim(); }
    private static BusinessApiException notFound(String message) {
        return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }
    private record MaterialOwner(UUID companyId, String materialName) { }
}

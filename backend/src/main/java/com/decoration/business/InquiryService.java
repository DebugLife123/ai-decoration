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

    public InquiryService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public CompanyInquiry create(UUID consumerId, CreateInquiryRequest request) {
        var materials = jdbc.query("""
                select m.company_id, m.name
                from material_quotes m
                join company_certifications cert on cert.company_id = m.company_id and cert.status = 'APPROVED'
                where m.id = ? and m.admin_hidden = false and m.valid_until >= current_date
                """, (rs, row) -> new MaterialOwner(rs.getObject("company_id", UUID.class), rs.getString("name")),
                request.materialId());
        if (materials.isEmpty()) throw notFound("材料当前不可咨询");
        var owner = materials.getFirst();
        var now = Timestamp.from(Instant.now());
        var id = UUID.randomUUID();
        jdbc.update("""
                insert into company_inquiries(id, company_id, consumer_id, material_quote_id, material_name,
                    contact_name, contact_info, message, status, version, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 0, ?, ?)
                """, id, owner.companyId(), consumerId, request.materialId(), owner.materialName(),
                clean(request.contactName()), clean(request.contactInfo()), clean(request.message()), now, now);
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
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")));
        return hasStatus ? jdbc.query(sql, mapper, companyId, status.name()) : jdbc.query(sql, mapper, companyId);
    }

    @Transactional
    public CompanyInquiry updateStatus(UUID companyId, UUID inquiryId, UpdateInquiryStatusRequest request) {
        var changed = jdbc.update("""
                update company_inquiries set status = ?, version = version + 1, updated_at = ?
                where company_id = ? and id = ? and version = ?
                """, request.status().name(), Timestamp.from(Instant.now()), companyId, inquiryId, request.version());
        if (changed == 0) {
            var exists = Boolean.TRUE.equals(jdbc.queryForObject(
                    "select exists(select 1 from company_inquiries where company_id = ? and id = ?)",
                    Boolean.class, companyId, inquiryId));
            if (!exists) throw notFound("咨询记录不存在");
            throw new BusinessApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "咨询记录已更新，请刷新后重试");
        }
        return find(companyId, inquiryId);
    }

    private CompanyInquiry find(UUID companyId, UUID inquiryId) {
        return jdbc.query("""
                select id, material_quote_id, material_name, contact_name, contact_info, message,
                    status, version, created_at, updated_at
                from company_inquiries where company_id = ? and id = ?
                """, rs -> rs.next() ? new CompanyInquiry(
                rs.getObject("id", UUID.class), rs.getObject("material_quote_id", UUID.class), rs.getString("material_name"),
                rs.getString("contact_name"), rs.getString("contact_info"), rs.getString("message"),
                InquiryStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at"))) : null,
                companyId, inquiryId);
    }

    private static Instant instant(Timestamp timestamp) { return timestamp == null ? null : timestamp.toInstant(); }
    private static String clean(String value) { return value.trim(); }
    private static BusinessApiException notFound(String message) {
        return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }
    private record MaterialOwner(UUID companyId, String materialName) { }
}

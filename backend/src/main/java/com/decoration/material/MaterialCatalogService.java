package com.decoration.material;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static com.decoration.material.MaterialCatalogDtos.CatalogMaterial;
import static com.decoration.material.MaterialCatalogDtos.Page;
import static com.decoration.material.MaterialCatalogDtos.PageMeta;

/**
 * 平台侧材料目录：把已通过认证的企业录入的、仍在有效期内的材料报价汇总成 C 端只读列表。
 * 未认证企业的报价不对外发布。
 */
@Service
public class MaterialCatalogService {
    private static final RowMapper<CatalogMaterial> MAPPER = (rs, row) -> new CatalogMaterial(
            rs.getObject("id", java.util.UUID.class),
            rs.getObject("company_id", java.util.UUID.class),
            rs.getString("company_name"),
            rs.getString("company_contact_name"),
            rs.getString("company_contact_info"),
            rs.getString("name"),
            rs.getString("specification"),
            rs.getString("unit"),
            rs.getBigDecimal("price"),
            rs.getString("brand"),
            rs.getString("category"),
            rs.getString("region"),
            rs.getObject("valid_until", LocalDate.class),
            rs.getObject("image_id", java.util.UUID.class),
            List.of(),
            instant(rs, "updated_at"));

    /** 只取出已认证且在有效期内的报价，并带上企业展示名。 */
    private static final String BASE_FROM = """
             from material_quotes m
             join company_certifications cert
               on cert.company_id = m.company_id and cert.status = 'APPROVED'
             left join company_profiles p on p.company_id = m.company_id
             left join auth_companies c on c.id = m.company_id
            """;

    private final JdbcTemplate jdbc;

    public MaterialCatalogService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Page<CatalogMaterial> list(String region, String category, String query,
                                      boolean includeExpired, int page, int size, String sort) {
        var where = new StringBuilder(" where m.admin_hidden = false and c.is_demo = false");
        var args = new ArrayList<Object>();
        if (region != null && !region.isBlank()) {
            where.append(" and m.region = ?");
            args.add(region.trim());
        }
        if (category != null && !category.isBlank()) {
            where.append(" and m.category = ?");
            args.add(category.trim());
        }
        if (query != null && !query.isBlank()) {
            where.append(" and (lower(m.name) like ? or lower(m.specification) like ? or lower(m.region) like ?)");
            var pattern = "%" + query.trim().toLowerCase() + "%";
            args.add(pattern);
            args.add(pattern);
            args.add(pattern);
        }
        if (!includeExpired) where.append(" and m.valid_until >= current_date");

        var total = jdbc.queryForObject("select count(*)" + BASE_FROM + where, Long.class, args.toArray());
        var queryArgs = new ArrayList<>(args);
        queryArgs.add(size);
        queryArgs.add((long) (page - 1) * size);
        var rows = jdbc.query(
                "select m.*, coalesce(p.name, c.name) as company_name, "
                        + "p.public_contact_name as company_contact_name, p.public_contact_info as company_contact_info"
                        + BASE_FROM + where
                        + " order by " + order(sort) + " limit ? offset ?",
                MAPPER, queryArgs.toArray());
        var items = rows.stream().map(this::withImages).toList();
        var count = total == null ? 0L : total;
        return new Page<>(items, new PageMeta(page, size, count, (int) Math.ceil(count / (double) size)));
    }

    private CatalogMaterial withImages(CatalogMaterial item) {
        var imageIds = jdbc.query("select image_id from material_quote_images where quote_id = ? order by position",
                (rs, row) -> rs.getObject(1, java.util.UUID.class), item.id());
        return new CatalogMaterial(item.id(), item.companyId(), item.companyName(), item.companyContactName(),
                item.companyContactInfo(), item.name(), item.spec(), item.unit(), item.price(), item.brand(),
                item.category(), item.region(), item.validUntil(),
                imageIds.isEmpty() ? item.imageId() : imageIds.getFirst(), imageIds, item.updatedAt());
    }

    private static String order(String sort) {
        if (sort == null) sort = "updatedAt";
        return switch (sort) {
            case "price" -> "m.price asc, m.id";
            case "updatedAt", "" -> "m.updated_at desc, m.id";
            default -> "m.updated_at desc, m.id";
        };
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}

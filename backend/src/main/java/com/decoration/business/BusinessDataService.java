package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import static com.decoration.business.BusinessDtos.*;

@Service
public class BusinessDataService {
    private static final RowMapper<Profile> PROFILE_MAPPER = (rs, row) -> new Profile(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("city"),
            rs.getString("services"), rs.getString("intro"), rs.getInt("version"),
            instant(rs, "created_at"), instant(rs, "updated_at"));
    private static final RowMapper<BusinessCase> CASE_MAPPER = (rs, row) -> new BusinessCase(
            rs.getObject("id", UUID.class), rs.getString("title"), rs.getBigDecimal("area"),
            rs.getString("style"), rs.getBigDecimal("budget"), CaseStatus.valueOf(rs.getString("status")),
            List.of(), rs.getInt("version"), instant(rs, "created_at"), instant(rs, "updated_at"));
    private static final RowMapper<MaterialQuote> MATERIAL_MAPPER = (rs, row) -> new MaterialQuote(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("specification"),
            rs.getString("unit"), rs.getBigDecimal("price"), rs.getString("category"),
            rs.getString("region"), rs.getObject("valid_until", LocalDate.class), rs.getInt("version"),
            instant(rs, "created_at"), instant(rs, "updated_at"));
    private static final RowMapper<LaborQuote> LABOR_MAPPER = (rs, row) -> new LaborQuote(
            rs.getObject("id", UUID.class), rs.getString("labor_type"), rs.getString("unit"),
            rs.getBigDecimal("price"), rs.getString("region"), rs.getObject("valid_until", LocalDate.class),
            rs.getInt("version"), instant(rs, "created_at"), instant(rs, "updated_at"));

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public BusinessDataService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Profile getProfile(UUID companyId) {
        var rows = jdbc.query("select * from company_profiles where company_id = ?", PROFILE_MAPPER, companyId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    @Transactional
    public Profile saveProfile(UUID companyId, ProfileRequest request) {
        var current = getProfile(companyId);
        var now = Timestamp.from(Instant.now());
        if (current == null) {
            var id = UUID.randomUUID();
            jdbc.update("""
                    insert into company_profiles(company_id, id, name, city, services, intro, version, created_at, updated_at)
                    values (?, ?, ?, ?, ?, ?, 0, ?, ?)
                    """, companyId, id, clean(request.name()), clean(request.city()), clean(request.services()),
                    clean(request.intro()), now, now);
        } else {
            if (request.version() == null || request.version() != current.version()) {
                throw versionConflict();
            }
            var changed = jdbc.update("""
                    update company_profiles set name = ?, city = ?, services = ?, intro = ?,
                    version = version + 1, updated_at = ? where company_id = ? and version = ?
                    """, clean(request.name()), clean(request.city()), clean(request.services()), clean(request.intro()),
                    now, companyId, request.version());
            if (changed == 0) throw versionConflict();
        }
        return getProfile(companyId);
    }

    public Page<BusinessCase> listCases(UUID companyId, CaseStatus status, int page, int size, String sort) {
        var order = caseSort(sort);
        var offset = (long) (page - 1) * size;
        var total = status == null
                ? jdbc.queryForObject("select count(*) from business_cases where company_id = ?", Long.class, companyId)
                : jdbc.queryForObject("select count(*) from business_cases where company_id = ? and status = ?", Long.class, companyId, status.name());
        var rows = status == null
                ? jdbc.query("select * from business_cases where company_id = ? order by " + order + " limit ? offset ?", CASE_MAPPER, companyId, size, offset)
                : jdbc.query("select * from business_cases where company_id = ? and status = ? order by " + order + " limit ? offset ?", CASE_MAPPER, companyId, status.name(), size, offset);
        var items = rows.stream().map(item -> withCaseFiles(companyId, item)).toList();
        return page(items, page, size, total);
    }

    public BusinessCase getCase(UUID companyId, UUID id) {
        var rows = jdbc.query("select * from business_cases where company_id = ? and id = ?", CASE_MAPPER, companyId, id);
        if (rows.isEmpty()) throw notFound();
        return withCaseFiles(companyId, rows.getFirst());
    }

    @Transactional
    public Created<BusinessCase> createCase(UUID companyId, String key, CaseRequest request) {
        ensureDistinct(request.fileIds());
        var id = UUID.randomUUID();
        var actualId = idempotentResource(companyId, key, "case", request, id);
        if (!actualId.equals(id)) return new Created<>(getCase(companyId, actualId), false);
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into business_cases(id, company_id, title, area, style, budget, status, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, companyId, clean(request.title()), request.area(), clean(request.style()), request.budget(),
                (request.status() == null ? CaseStatus.draft : request.status()).name(), now, now);
        saveCaseFiles(companyId, id, request.fileIds());
        return new Created<>(getCase(companyId, id), true);
    }

    @Transactional
    public BusinessCase patchCase(UUID companyId, UUID id, CasePatch patch) {
        if (!patch.hasChanges()) throw invalid("At least one case field must be supplied");
        var current = getCase(companyId, id);
        if (patch.version() != current.version()) throw versionConflict();
        var changed = jdbc.update("""
                update business_cases set title = ?, area = ?, style = ?, budget = ?, status = ?,
                version = version + 1, updated_at = ? where company_id = ? and id = ? and version = ?
                """, patch.title() == null ? current.title() : clean(patch.title()),
                patch.area() == null ? current.area() : patch.area(), patch.style() == null ? current.style() : clean(patch.style()),
                patch.budget() == null ? current.budget() : patch.budget(),
                patch.status() == null ? current.status().name() : patch.status().name(), Timestamp.from(Instant.now()),
                companyId, id, patch.version());
        if (changed == 0) throw versionConflict();
        if (patch.fileIds() != null) {
            ensureDistinct(patch.fileIds());
            saveCaseFiles(companyId, id, patch.fileIds());
        }
        return getCase(companyId, id);
    }

    @Transactional
    public void deleteCase(UUID companyId, UUID id, int version) {
        deleteVersioned("business_cases", companyId, id, version);
    }

    public Page<MaterialQuote> listMaterialQuotes(UUID companyId, String region, String category,
                                                   boolean includeExpired, int page, int size, String sort) {
        var where = new StringBuilder(" where company_id = ?");
        var args = new ArrayList<Object>();
        args.add(companyId);
        if (region != null && !region.isBlank()) { where.append(" and region = ?"); args.add(clean(region)); }
        if (category != null && !category.isBlank()) { where.append(" and category = ?"); args.add(clean(category)); }
        if (!includeExpired) where.append(" and valid_until >= current_date");
        return materialPage(where.toString(), args, page, size, quoteSort(sort));
    }

    public MaterialQuote getMaterialQuote(UUID companyId, UUID id) {
        return getOne("material_quotes", companyId, id, MATERIAL_MAPPER, "Material quote");
    }

    @Transactional
    public Created<MaterialQuote> createMaterialQuote(UUID companyId, String key, MaterialQuoteRequest request) {
        validateDate(request.validUntil());
        var id = UUID.randomUUID();
        var actualId = idempotentResource(companyId, key, "material-quote", request, id);
        if (!actualId.equals(id)) return new Created<>(getMaterialQuote(companyId, actualId), false);
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into material_quotes(id, company_id, name, specification, unit, price, category, region,
                    valid_until, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, companyId, clean(request.name()), clean(request.spec()), clean(request.unit()), request.price(),
                clean(request.category()), clean(request.region()), request.validUntil(), now, now);
        return new Created<>(getMaterialQuote(companyId, id), true);
    }

    @Transactional
    public MaterialQuote patchMaterialQuote(UUID companyId, UUID id, MaterialQuotePatch patch) {
        if (!patch.hasChanges()) throw invalid("At least one quote field must be supplied");
        var current = getMaterialQuote(companyId, id);
        if (patch.version() != current.version()) throw versionConflict();
        if (patch.validUntil() != null) validateDate(patch.validUntil());
        var changed = jdbc.update("""
                update material_quotes set name = ?, specification = ?, unit = ?, price = ?, category = ?, region = ?,
                    valid_until = ?, version = version + 1, updated_at = ?
                where company_id = ? and id = ? and version = ?
                """, patch.name() == null ? current.name() : clean(patch.name()),
                patch.spec() == null ? current.spec() : clean(patch.spec()), patch.unit() == null ? current.unit() : clean(patch.unit()),
                patch.price() == null ? current.price() : patch.price(), patch.category() == null ? current.category() : clean(patch.category()),
                patch.region() == null ? current.region() : clean(patch.region()),
                patch.validUntil() == null ? current.validUntil() : patch.validUntil(), Timestamp.from(Instant.now()), companyId, id, patch.version());
        if (changed == 0) throw versionConflict();
        return getMaterialQuote(companyId, id);
    }

    @Transactional
    public void deleteMaterialQuote(UUID companyId, UUID id, int version) {
        deleteVersioned("material_quotes", companyId, id, version);
    }

    public Page<LaborQuote> listLaborQuotes(UUID companyId, String region, boolean includeExpired,
                                             int page, int size, String sort) {
        var where = new StringBuilder(" where company_id = ?");
        var args = new ArrayList<Object>();
        args.add(companyId);
        if (region != null && !region.isBlank()) { where.append(" and region = ?"); args.add(clean(region)); }
        if (!includeExpired) where.append(" and valid_until >= current_date");
        return laborPage(where.toString(), args, page, size, laborSort(sort));
    }

    public LaborQuote getLaborQuote(UUID companyId, UUID id) {
        return getOne("labor_quotes", companyId, id, LABOR_MAPPER, "Labor quote");
    }

    @Transactional
    public Created<LaborQuote> createLaborQuote(UUID companyId, String key, LaborQuoteRequest request) {
        validateDate(request.validUntil());
        var id = UUID.randomUUID();
        var actualId = idempotentResource(companyId, key, "labor-quote", request, id);
        if (!actualId.equals(id)) return new Created<>(getLaborQuote(companyId, actualId), false);
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into labor_quotes(id, company_id, labor_type, unit, price, region, valid_until, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, companyId, clean(request.type()), clean(request.unit()), request.price(), clean(request.region()),
                request.validUntil(), now, now);
        return new Created<>(getLaborQuote(companyId, id), true);
    }

    @Transactional
    public LaborQuote patchLaborQuote(UUID companyId, UUID id, LaborQuotePatch patch) {
        if (!patch.hasChanges()) throw invalid("At least one quote field must be supplied");
        var current = getLaborQuote(companyId, id);
        if (patch.version() != current.version()) throw versionConflict();
        if (patch.validUntil() != null) validateDate(patch.validUntil());
        var changed = jdbc.update("""
                update labor_quotes set labor_type = ?, unit = ?, price = ?, region = ?, valid_until = ?,
                    version = version + 1, updated_at = ? where company_id = ? and id = ? and version = ?
                """, patch.type() == null ? current.type() : clean(patch.type()), patch.unit() == null ? current.unit() : clean(patch.unit()),
                patch.price() == null ? current.price() : patch.price(), patch.region() == null ? current.region() : clean(patch.region()),
                patch.validUntil() == null ? current.validUntil() : patch.validUntil(), Timestamp.from(Instant.now()), companyId, id, patch.version());
        if (changed == 0) throw versionConflict();
        return getLaborQuote(companyId, id);
    }

    @Transactional
    public void deleteLaborQuote(UUID companyId, UUID id, int version) {
        deleteVersioned("labor_quotes", companyId, id, version);
    }

    private Page<MaterialQuote> materialPage(String where, List<Object> args, int page, int size, String order) {
        var total = jdbc.queryForObject("select count(*) from material_quotes" + where, Long.class, args.toArray());
        var queryArgs = new ArrayList<>(args);
        queryArgs.add(size);
        queryArgs.add((long) (page - 1) * size);
        var items = jdbc.query("select * from material_quotes" + where + " order by " + order + " limit ? offset ?", MATERIAL_MAPPER, queryArgs.toArray());
        return page(items, page, size, total);
    }

    private Page<LaborQuote> laborPage(String where, List<Object> args, int page, int size, String order) {
        var total = jdbc.queryForObject("select count(*) from labor_quotes" + where, Long.class, args.toArray());
        var queryArgs = new ArrayList<>(args);
        queryArgs.add(size);
        queryArgs.add((long) (page - 1) * size);
        var items = jdbc.query("select * from labor_quotes" + where + " order by " + order + " limit ? offset ?", LABOR_MAPPER, queryArgs.toArray());
        return page(items, page, size, total);
    }

    private <T> T getOne(String table, UUID companyId, UUID id, RowMapper<T> mapper, String label) {
        var rows = jdbc.query("select * from " + table + " where company_id = ? and id = ?", mapper, companyId, id);
        if (rows.isEmpty()) throw notFound();
        return rows.getFirst();
    }

    private BusinessCase withCaseFiles(UUID companyId, BusinessCase item) {
        var fileIds = jdbc.query("""
                select cf.file_id from business_case_files cf join business_cases c on c.id = cf.case_id
                where c.company_id = ? and c.id = ? order by cf.position
                """, (rs, row) -> rs.getObject(1, UUID.class), companyId, item.id());
        return new BusinessCase(item.id(), item.title(), item.area(), item.style(), item.budget(), item.status(),
                fileIds, item.version(), item.createdAt(), item.updatedAt());
    }

    private void saveCaseFiles(UUID companyId, UUID caseId, List<UUID> fileIds) {
        jdbc.update("delete from business_case_files where case_id = ?", caseId);
        if (fileIds == null || fileIds.isEmpty()) return;
        var placeholders = String.join(",", java.util.Collections.nCopies(fileIds.size(), "?"));
        var arguments = new ArrayList<Object>();
        arguments.add(companyId);
        arguments.addAll(fileIds);
        var owned = jdbc.queryForObject("select count(*) from business_assets where company_id = ? and id in (" + placeholders + ")",
                Long.class, arguments.toArray());
        if (owned == null || owned != fileIds.size()) throw notFound();
        for (int index = 0; index < fileIds.size(); index++) {
            jdbc.update("insert into business_case_files(company_id, case_id, file_id, position) values (?, ?, ?, ?)",
                    companyId, caseId, fileIds.get(index), index);
        }
    }

    private UUID idempotentResource(UUID companyId, String key, String type, Object request, UUID proposedId) {
        var now = Timestamp.from(Instant.now());
        jdbc.update("delete from business_idempotency_keys where company_id = ? and idempotency_key = ? and expires_at <= ?", companyId, key, now);
        var hash = requestHash(request);
        jdbc.update("""
                insert into business_idempotency_keys(company_id, idempotency_key, request_hash, resource_type, resource_id, created_at, expires_at)
                values (?, ?, ?, ?, ?, ?, ?)
                on conflict (company_id, idempotency_key) do nothing
                """, companyId, key, hash, type, proposedId, now, Timestamp.from(now.toInstant().plusSeconds(86400)));
        var existing = jdbc.query("""
                select request_hash, resource_type, resource_id from business_idempotency_keys
                where company_id = ? and idempotency_key = ?
                """, (rs, row) -> new IdempotencyRecord(rs.getString(1), rs.getString(2), rs.getObject(3, UUID.class)), companyId, key).getFirst();
        if (!existing.requestHash().equals(hash) || !existing.resourceType().equals(type)) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different request");
        }
        return existing.resourceId();
    }

    private void deleteVersioned(String table, UUID companyId, UUID id, int version) {
        var changed = jdbc.update("delete from " + table + " where company_id = ? and id = ? and version = ?", companyId, id, version);
        if (changed == 0) {
            if (!exists(table, companyId, id)) throw notFound();
            throw versionConflict();
        }
    }

    private boolean exists(String table, UUID companyId, UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from " + table + " where company_id = ? and id = ?)", Boolean.class, companyId, id));
    }

    private static void ensureDistinct(List<UUID> ids) {
        if (ids != null && ids.stream().distinct().count() != ids.size()) throw invalid("fileIds must be unique");
    }

    private static void validateDate(LocalDate date) {
        if (date.isBefore(LocalDate.now())) throw invalid("validUntil must be today or later");
        if (date.isAfter(LocalDate.now().plusYears(10))) throw invalid("validUntil must be within the next 10 years");
    }

    private String requestHash(Object request) {
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(objectMapper.writeValueAsBytes(request));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | JsonProcessingException exception) {
            throw new IllegalStateException("Unable to hash request", exception);
        }
    }

    private static String clean(String value) {
        return value == null ? null : value.trim();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static <T> Page<T> page(List<T> items, int page, int size, long total) {
        return new Page<>(items, new PageMeta(page, size, total, (int) Math.ceil(total / (double) size)));
    }

    private static String caseSort(String sort) {
        if (sort == null) sort = "updatedAt";
        return switch (sort) {
            case "createdAt" -> "created_at desc, id";
            case "title" -> "lower(title), id";
            case "updatedAt", "" -> "updated_at desc, id";
            default -> throw invalid("Unsupported sort field");
        };
    }

    private static String quoteSort(String sort) {
        if (sort == null) sort = "updatedAt";
        return switch (sort) {
            case "createdAt" -> "created_at desc, id";
            case "name" -> "lower(name), id";
            case "updatedAt", "" -> "updated_at desc, id";
            default -> throw invalid("Unsupported sort field");
        };
    }

    private static String laborSort(String sort) {
        if (sort == null) sort = "updatedAt";
        return switch (sort) {
            case "createdAt" -> "created_at desc, id";
            case "type" -> "lower(labor_type), id";
            case "updatedAt", "" -> "updated_at desc, id";
            default -> throw invalid("Unsupported sort field");
        };
    }

    private static BusinessApiException invalid(String message) {
        return new BusinessApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }

    private static BusinessApiException notFound() {
        return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
    }

    private static BusinessApiException versionConflict() {
        return new BusinessApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "Resource version is stale");
    }

    private record IdempotencyRecord(String requestHash, String resourceType, UUID resourceId) {
    }

    public record Created<T>(T value, boolean created) {
    }
}

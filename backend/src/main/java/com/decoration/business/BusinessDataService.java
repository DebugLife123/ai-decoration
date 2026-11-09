package com.decoration.business;

import com.decoration.budget.BudgetUnitKind;
import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import static com.decoration.business.BusinessDtos.*;

@Service
public class BusinessDataService {
    private static final RowMapper<Profile> PROFILE_MAPPER = (rs, row) -> new Profile(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("city"),
            rs.getString("services"), rs.getString("intro"), rs.getString("public_contact_name"),
            rs.getString("public_contact_info"), rs.getString("service_areas"),
            rs.getString("business_hours"), rs.getObject("logo_asset_id", UUID.class),
            rs.getObject("storefront_asset_id", UUID.class), rs.getInt("version"),
            instant(rs, "created_at"), instant(rs, "updated_at"));
    private static final RowMapper<BusinessCase> CASE_MAPPER = (rs, row) -> new BusinessCase(
            rs.getObject("id", UUID.class), rs.getString("title"), rs.getBigDecimal("area"),
            rs.getString("style"), rs.getBigDecimal("budget"), CaseStatus.valueOf(rs.getString("status")),
            List.of(), rs.getInt("version"), instant(rs, "created_at"), instant(rs, "updated_at"));
    private static final RowMapper<MaterialQuote> MATERIAL_MAPPER = (rs, row) -> new MaterialQuote(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("specification"),
            rs.getString("unit"), rs.getBigDecimal("price"), rs.getString("brand"), rs.getString("category"),
            rs.getString("region"), rs.getObject("valid_until", LocalDate.class), rs.getObject("image_id", UUID.class), List.of(), rs.getInt("version"),
            instant(rs, "created_at"), instant(rs, "updated_at"),
            rs.getString("unit_kind"), rs.getBoolean("unit_unknown"), rs.getString("item_nature"));
    private static final RowMapper<LaborQuote> LABOR_MAPPER = (rs, row) -> new LaborQuote(
            rs.getObject("id", UUID.class), rs.getString("labor_type"), rs.getString("unit"),
            rs.getBigDecimal("price"), rs.getString("region"), rs.getObject("valid_until", LocalDate.class),
            rs.getInt("version"), instant(rs, "created_at"), instant(rs, "updated_at"),
            rs.getString("unit_kind"), rs.getBoolean("unit_unknown"), rs.getString("item_nature"),
            rs.getBoolean("admin_hidden"));

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final IdempotencyStore idempotency;

    public BusinessDataService(JdbcTemplate jdbc, ObjectMapper objectMapper, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.idempotency = idempotency;
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
                    insert into company_profiles(company_id, id, name, city, services, intro,
                        public_contact_name, public_contact_info, service_areas, business_hours,
                        logo_asset_id, storefront_asset_id, version, created_at, updated_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                    """, companyId, id, clean(request.name()), clean(request.city()), clean(request.services()),
                    clean(request.intro()), clean(request.publicContactName()), clean(request.publicContactInfo()),
                    clean(request.serviceAreas()), clean(request.businessHours()),
                    validateProfileImage(companyId, request.logoAssetId()), validateProfileImage(companyId, request.storefrontAssetId()), now, now);
        } else {
            if (request.version() == null || request.version() != current.version()) {
                throw versionConflict();
            }
            var changed = jdbc.update("""
                    update company_profiles set name = ?, city = ?, services = ?, intro = ?,
                    public_contact_name = ?, public_contact_info = ?, service_areas = ?, business_hours = ?,
                    logo_asset_id = ?, storefront_asset_id = ?,
                    version = version + 1, updated_at = ? where company_id = ? and version = ?
                    """, clean(request.name()), clean(request.city()), clean(request.services()), clean(request.intro()),
                    clean(request.publicContactName()), clean(request.publicContactInfo()), clean(request.serviceAreas()),
                    clean(request.businessHours()), validateProfileImage(companyId, request.logoAssetId()),
                    validateProfileImage(companyId, request.storefrontAssetId()), now, companyId, request.version());
            if (changed == 0) throw versionConflict();
        }
        return getProfile(companyId);
    }

    private UUID validateProfileImage(UUID companyId, UUID assetId) {
        if (assetId == null) return null;
        var valid = jdbc.queryForObject("select exists(select 1 from business_assets where company_id = ? and id = ? and (media_type like 'image/%' or lower(file_name) like '%.bmp'))", Boolean.class, companyId, assetId);
        if (!Boolean.TRUE.equals(valid)) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_PROFILE_IMAGE", "Logo 或门店图片必须是当前企业已上传的图片");
        }
        return assetId;
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
        // 创建一律落为草稿；发布只能走 publishCase，避免绕过认证检查与审计。
        if (request.status() != null && request.status() != CaseStatus.draft) {
            throw invalid("案例创建只支持草稿，发布请使用 POST /cases/{caseId}/publish");
        }
        var id = UUID.randomUUID();
        var actualId = idempotentResource(companyId, key, "case", request, id);
        if (!actualId.equals(id)) return new Created<>(getCase(companyId, actualId), false);
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into business_cases(id, company_id, title, area, style, budget, status, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, companyId, clean(request.title()), request.area(), clean(request.style()), request.budget(),
                CaseStatus.draft.name(), now, now);
        saveCaseFiles(companyId, id, request.fileIds());
        return new Created<>(getCase(companyId, id), true);
    }

    @Transactional
    public BusinessCase patchCase(UUID companyId, UUID id, CasePatch patch) {
        if (!patch.hasChanges()) throw invalid("At least one case field must be supplied");
        var current = getCase(companyId, id);
        if (patch.version() != current.version()) throw versionConflict();
        if (patch.status() == CaseStatus.published && current.status() != CaseStatus.published)
            requireApprovedCertification(companyId);
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
    public BusinessCase publishCase(UUID companyId, UUID id, int version) {
        var current = getCase(companyId, id);
        if (current.status() == CaseStatus.published) return current;
        requireApprovedCertification(companyId);
        return patchCase(companyId, id, new CasePatch(null, null, null, null,
                CaseStatus.published, null, version));
    }

    private void requireApprovedCertification(UUID companyId) {
        var certified = Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from company_certifications where company_id = ? and status = 'APPROVED')",
                Boolean.class, companyId));
        if (!certified) throw new BusinessApiException(HttpStatus.CONFLICT, "CERTIFICATION_REQUIRED",
                "企业认证通过后才能发布案例");
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
        return withMaterialImages(materialPage(where.toString(), args, page, size, quoteSort(sort)));
    }

    private Page<MaterialQuote> withMaterialImages(Page<MaterialQuote> page) {
        return new Page<>(page.items().stream().map(this::withMaterialImages).toList(), page.page());
    }

    private MaterialQuote withMaterialImages(MaterialQuote quote) {
        var ids = jdbc.query("select image_id from material_quote_images where quote_id = ? order by position",
                (rs, row) -> rs.getObject(1, UUID.class), quote.id());
        return new MaterialQuote(quote.id(), quote.name(), quote.spec(), quote.unit(), quote.price(), quote.brand(),
                quote.category(), quote.region(), quote.validUntil(), ids.isEmpty() ? quote.imageId() : ids.getFirst(),
                ids, quote.version(), quote.createdAt(), quote.updatedAt(),
                quote.unitKind(), quote.unitUnknown(), quote.itemNature());
    }

    public MaterialQuote getMaterialQuote(UUID companyId, UUID id) {
        return withMaterialImages(getOne("material_quotes", companyId, id, MATERIAL_MAPPER, "Material quote"));
    }

    @Transactional
    public Created<MaterialQuote> createMaterialQuote(UUID companyId, String key, MaterialQuoteRequest request) {
        validateDate(request.validUntil());
        var imageIds = requestedImages(request.imageIds(), request.imageId());
        validateMaterialImages(companyId, imageIds);
        var itemNature = validateItemNature(request.itemNatureOrDefault());
        var unit = clean(request.unit());
        var unitKind = BudgetUnitKind.fromLabel(unit);
        var id = UUID.randomUUID();
        var actualId = idempotentResource(companyId, key, "material-quote", request, id);
        if (!actualId.equals(id)) return new Created<>(getMaterialQuote(companyId, actualId), false);
        var now = Timestamp.from(Instant.now());
        try {
            jdbc.update("""
                    insert into material_quotes(id, company_id, name, specification, unit, price, brand, category, region,
                        valid_until, image_id, created_at, updated_at, unit_kind, unit_unknown, item_nature)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, id, companyId, clean(request.name()), clean(request.spec()), unit, request.price(), clean(request.brand()),
                    clean(request.category()), clean(request.region()), request.validUntil(), imageIds.isEmpty() ? null : imageIds.getFirst(), now, now,
                    unitKind.name(), unitKind == BudgetUnitKind.UNKNOWN, itemNature);
        } catch (DuplicateKeyException exception) {
            throw duplicateQuote();
        }
        saveMaterialImages(companyId, id, imageIds);
        return new Created<>(getMaterialQuote(companyId, id), true);
    }

    @Transactional
    public MaterialQuote patchMaterialQuote(UUID companyId, UUID id, MaterialQuotePatch patch) {
        if (!patch.hasChanges()) throw invalid("At least one quote field must be supplied");
        var current = getMaterialQuote(companyId, id);
        if (patch.version() != current.version()) throw versionConflict();
        if (patch.validUntil() != null) validateDate(patch.validUntil());
        if (!patch.clearImage()) validateMaterialImage(companyId, patch.imageId());
        var imageIds = patch.imageIds() != null ? patch.imageIds()
                : patch.clearImage() ? List.<UUID>of()
                : patch.imageId() != null ? List.of(patch.imageId()) : null;
        if (imageIds != null) validateMaterialImages(companyId, imageIds);
        var nextUnit = patch.unit() == null ? current.unit() : clean(patch.unit());
        var nextUnitKind = BudgetUnitKind.fromLabel(nextUnit);
        var nextNature = patch.itemNature() == null ? current.itemNature() : validateItemNature(clean(patch.itemNature()));
        int changed;
        try {
            changed = jdbc.update("""
                    update material_quotes set name = ?, specification = ?, unit = ?, price = ?, brand = ?, category = ?, region = ?,
                        valid_until = ?, image_id = ?, unit_kind = ?, unit_unknown = ?, item_nature = ?,
                        version = version + 1, updated_at = ?
                    where company_id = ? and id = ? and version = ?
                    """, patch.name() == null ? current.name() : clean(patch.name()),
                    patch.spec() == null ? current.spec() : clean(patch.spec()), nextUnit,
                    patch.price() == null ? current.price() : patch.price(), patch.brand() == null ? current.brand() : clean(patch.brand()),
                    patch.category() == null ? current.category() : clean(patch.category()),
                    patch.region() == null ? current.region() : clean(patch.region()),
                    patch.validUntil() == null ? current.validUntil() : patch.validUntil(),
                    imageIds != null ? (imageIds.isEmpty() ? null : imageIds.getFirst())
                            : patch.clearImage() ? null : patch.imageId() == null ? current.imageId() : patch.imageId(),
                    nextUnitKind.name(), nextUnitKind == BudgetUnitKind.UNKNOWN, nextNature,
                    Timestamp.from(Instant.now()), companyId, id, patch.version());
        } catch (DuplicateKeyException exception) {
            throw duplicateQuote();
        }
        if (changed == 0) throw versionConflict();
        if (imageIds != null) saveMaterialImages(companyId, id, imageIds);
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
        var itemNature = validateItemNature(request.itemNatureOrDefault());
        var unit = clean(request.unit());
        var unitKind = BudgetUnitKind.fromLabel(unit);
        var id = UUID.randomUUID();
        var actualId = idempotentResource(companyId, key, "labor-quote", request, id);
        if (!actualId.equals(id)) return new Created<>(getLaborQuote(companyId, actualId), false);
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into labor_quotes(id, company_id, labor_type, unit, price, region, valid_until, created_at, updated_at,
                    unit_kind, unit_unknown, item_nature)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, companyId, clean(request.type()), unit, request.price(), clean(request.region()),
                request.validUntil(), now, now, unitKind.name(), unitKind == BudgetUnitKind.UNKNOWN, itemNature);
        return new Created<>(getLaborQuote(companyId, id), true);
    }

    @Transactional
    public LaborQuote patchLaborQuote(UUID companyId, UUID id, LaborQuotePatch patch) {
        if (!patch.hasChanges()) throw invalid("At least one quote field must be supplied");
        var current = getLaborQuote(companyId, id);
        if (patch.version() != current.version()) throw versionConflict();
        if (patch.validUntil() != null) validateDate(patch.validUntil());
        var nextUnit = patch.unit() == null ? current.unit() : clean(patch.unit());
        var nextUnitKind = BudgetUnitKind.fromLabel(nextUnit);
        var nextNature = patch.itemNature() == null ? current.itemNature() : validateItemNature(clean(patch.itemNature()));
        var changed = jdbc.update("""
                update labor_quotes set labor_type = ?, unit = ?, price = ?, region = ?, valid_until = ?,
                    unit_kind = ?, unit_unknown = ?, item_nature = ?, version = version + 1, updated_at = ?
                where company_id = ? and id = ? and version = ?
                """, patch.type() == null ? current.type() : clean(patch.type()), nextUnit,
                patch.price() == null ? current.price() : patch.price(), patch.region() == null ? current.region() : clean(patch.region()),
                patch.validUntil() == null ? current.validUntil() : patch.validUntil(),
                nextUnitKind.name(), nextUnitKind == BudgetUnitKind.UNKNOWN, nextNature,
                Timestamp.from(Instant.now()), companyId, id, patch.version());
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

    private void validateMaterialImage(UUID companyId, UUID imageId) {
        if (imageId == null) return;
        var ownedImages = jdbc.queryForObject("select count(*) from business_assets where company_id = ? and id = ? and media_type like 'image/%'",
                Long.class, companyId, imageId);
        if (ownedImages == null || ownedImages == 0) throw invalid("Material image must be an image uploaded by this company");
    }

    private void validateMaterialImages(UUID companyId, List<UUID> imageIds) {
        if (imageIds == null) return;
        if (imageIds.size() > 8 || imageIds.stream().distinct().count() != imageIds.size()) throw invalid("Material images must be unique and limited to 8");
        for (var imageId : imageIds) validateMaterialImage(companyId, imageId);
    }

    private void saveMaterialImages(UUID companyId, UUID quoteId, List<UUID> imageIds) {
        validateMaterialImages(companyId, imageIds);
        jdbc.update("delete from material_quote_images where quote_id = ?", quoteId);
        for (int position = 0; position < imageIds.size(); position++) {
            jdbc.update("insert into material_quote_images(company_id, quote_id, image_id, position) values (?, ?, ?, ?)",
                    companyId, quoteId, imageIds.get(position), position);
        }
    }

    private static List<UUID> requestedImages(List<UUID> imageIds, UUID legacyImageId) {
        if (imageIds != null) return imageIds;
        return legacyImageId == null ? List.<UUID>of() : List.of(legacyImageId);
    }

    private UUID idempotentResource(UUID companyId, String key, String type, Object request, UUID proposedId) {
        return idempotency.reserve(companyId, key, type, request, proposedId);
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

    /**
     * 校验项目性质。GIFT（赠送项）与 OWNER_SUPPLIED（业主自购）不计入合同造价，
     * 但必须能被单独筛选出来，所以落库而不是丢弃。
     */
    private static String validateItemNature(String nature) {
        return switch (nature) {
            case "INCLUDED", "GIFT", "OWNER_SUPPLIED" -> nature;
            default -> throw invalid("itemNature must be one of INCLUDED, GIFT, OWNER_SUPPLIED");
        };
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

    /**
     * 同一企业下「名称 + 规格 + 品牌 + 单位」已经存在时的响应。
     * 数据库用 material_quotes_natural_key_idx 兜底，这里把约束冲突翻译成可读的业务错误，
     * 而不是让前端只看到「A matching business record already exists」。
     */
    private static BusinessApiException duplicateQuote() {
        return new BusinessApiException(HttpStatus.CONFLICT, "DUPLICATE_QUOTE",
                "同名规格品牌的材料报价已存在，请直接修改那一条，或换一个规格/单位");
    }

    public record Created<T>(T value, boolean created) {
    }
}

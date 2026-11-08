package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;

@Service
public class BusinessAssetService {
    private static final Logger log = LoggerFactory.getLogger(BusinessAssetService.class);
    private final JdbcTemplate jdbc;
    private final Path storageRoot;

    public BusinessAssetService(JdbcTemplate jdbc, @Value("${app.storage.local-dir:./var/uploads}") String storageDir) {
        this.jdbc = jdbc;
        this.storageRoot = Path.of(storageDir).toAbsolutePath().normalize();
    }

    public BusinessAsset upload(UUID companyId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw invalid("A non-empty file is required");
        if (file.getSize() > 15L * 1024 * 1024) throw new BusinessApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "Files must be 15 MB or smaller");
        var mediaType = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
        if (!mediaType.startsWith("image/") && !mediaType.equals("application/pdf")) throw invalid("Only image and PDF files are supported");
        var id = UUID.randomUUID();
        var objectKey = companyId + "/" + id;
        var target = storageRoot.resolve(objectKey).normalize();
        if (!target.startsWith(storageRoot)) throw invalid("Invalid file path");
        try {
            Files.createDirectories(target.getParent());
            try (InputStream input = file.getInputStream()) {
                // InputStream copies do not support COPY_ATTRIBUTES on Windows.
                Files.copy(input, target);
            }
        } catch (IOException exception) {
            throw new BusinessApiException(HttpStatus.INTERNAL_SERVER_ERROR, "FILE_STORAGE_ERROR", "File could not be stored");
        }
        var name = Path.of(file.getOriginalFilename() == null ? "upload" : file.getOriginalFilename()).getFileName().toString();
        jdbc.update("insert into business_assets(company_id, id, file_name, object_key, media_type, created_at) values (?, ?, ?, ?, ?, ?)",
                companyId, id, name, objectKey, mediaType, java.sql.Timestamp.from(Instant.now()));
        return new BusinessAsset(id, name, mediaType, file.getSize(), Instant.now());
    }

    public StoredBusinessAsset get(UUID companyId, UUID assetId) {
        var result = jdbc.query("select file_name, object_key, media_type from business_assets where company_id = ? and id = ?",
                rs -> rs.next() ? storedAsset(rs.getString("file_name"), rs.getString("object_key"), rs.getString("media_type")) : null,
                companyId, assetId);
        return storedAsset(result);
    }

    @Transactional
    public void delete(UUID companyId, UUID assetId) {
        if (jdbc.query("select id from auth_companies where id = ? for update", (rs, row) -> rs.getObject(1, UUID.class), companyId).isEmpty()) {
            throwNotFound();
        }
        var rows = jdbc.query("select object_key from business_assets where company_id = ? and id = ? for update",
                (rs, row) -> rs.getString("object_key"), companyId, assetId);
        if (rows.isEmpty()) throwNotFound();
        if (isReferenced(companyId, assetId)) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "ASSET_ALREADY_IN_USE",
                    "已提交或正在使用的资料不能删除");
        }
        var path = storageRoot.resolve(rows.getFirst()).normalize();
        try {
            if (!path.startsWith(storageRoot) || isSymlinkEscape(path)) {
                throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "File was not found");
            }
        } catch (IOException exception) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "File was not found");
        }
        jdbc.update("delete from business_assets where company_id = ? and id = ?", companyId, assetId);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException exception) {
                    log.warn("Could not delete removed business asset file: company={}, asset={}", companyId, assetId, exception);
                }
            }
        });
    }

    public StoredBusinessAsset getPublicMaterialImage(UUID quoteId, UUID imageId) {
        var result = jdbc.query("""
                        select a.file_name, a.object_key, a.media_type
                        from material_quotes m
                        join company_certifications cert on cert.company_id = m.company_id and cert.status = 'APPROVED'
                        join material_quote_images mi on mi.company_id = m.company_id and mi.quote_id = m.id
                        join business_assets a on a.company_id = mi.company_id and a.id = mi.image_id
                        where m.id = ? and mi.image_id = ? and m.valid_until >= current_date
                          and (a.media_type like 'image/%' or lower(a.file_name) like '%.bmp')
                        """,
                rs -> rs.next() ? storedAsset(rs.getString("file_name"), rs.getString("object_key"), rs.getString("media_type")) : null,
                quoteId, imageId);
        return storedAsset(result);
    }

    public StoredBusinessAsset getPublicCaseFile(UUID caseId, UUID fileId) {
        var result = jdbc.query("""
                        select a.file_name, a.object_key, a.media_type
                        from business_cases c
                        join company_certifications cert on cert.company_id = c.company_id and cert.status = 'APPROVED'
                        join business_case_files cf on cf.company_id = c.company_id and cf.case_id = c.id
                        join business_assets a on a.company_id = cf.company_id and a.id = cf.file_id
                        where c.id = ? and c.status = 'published' and a.id = ?
                        """,
                rs -> rs.next() ? storedAsset(rs.getString("file_name"), rs.getString("object_key"), rs.getString("media_type")) : null,
                caseId, fileId);
        return storedAsset(result);
    }

    public StoredBusinessAsset getPublicCompanyImage(UUID companyId, UUID assetId) {
        var result = jdbc.query("""
                        select a.file_name, a.object_key, a.media_type
                        from auth_companies c
                        join company_certifications cert on cert.company_id = c.id and cert.status = 'APPROVED'
                        join company_profiles p on p.company_id = c.id
                        join business_assets a on a.company_id = c.id
                            and (a.id = p.logo_asset_id or a.id = p.storefront_asset_id)
                        where c.id = ? and c.is_demo = false and a.id = ?
                          and (a.media_type like 'image/%' or lower(a.file_name) like '%.bmp')
                        """, rs -> rs.next() ? storedAsset(rs.getString("file_name"), rs.getString("object_key"), rs.getString("media_type")) : null,
                companyId, assetId);
        return storedAsset(result);
    }

    public StoredBusinessAsset getCertificationDocument(UUID companyId, UUID assetId) {
        var result = jdbc.query("""
                        select a.file_name, a.object_key, a.media_type
                        from business_assets a
                        where a.company_id = ? and a.id = ?
                          and exists (
                              select 1 from company_certifications c,
                                  jsonb_array_elements_text(c.document_refs) document_ref
                              where c.company_id = a.company_id and document_ref.value = a.id::text
                          )
                        """,
                rs -> rs.next() ? storedAsset(rs.getString("file_name"), rs.getString("object_key"), rs.getString("media_type")) : null,
                companyId, assetId);
        return storedAsset(result);
    }

    private StoredBusinessAsset storedAsset(StoredBusinessAsset result) {
        if (result == null) throwNotFound();
        var path = storageRoot.resolve(result.objectKey()).normalize();
        if (!path.startsWith(storageRoot) || !Files.isRegularFile(path)) throwNotFound();
        return result.withResource(new FileSystemResource(path));
    }

    private StoredBusinessAsset storedAsset(String fileName, String objectKey, String mediaType) {
        return new StoredBusinessAsset(fileName, objectKey, normalizedMediaType(fileName, mediaType));
    }

    public boolean isFileAvailable(String objectKey) {
        var path = storageRoot.resolve(objectKey).normalize();
        return path.startsWith(storageRoot) && Files.isRegularFile(path);
    }

    private boolean isReferenced(UUID companyId, UUID assetId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from business_case_files where company_id = ? and file_id = ?)
                    or exists(select 1 from material_quote_images where company_id = ? and image_id = ?)
                    or exists(select 1 from company_certification_documents where company_id = ? and asset_id = ?)
                    or exists(select 1 from company_certifications c,
                        jsonb_array_elements_text(case when jsonb_typeof(c.document_refs) = 'array' then c.document_refs else '[]'::jsonb end) ref
                        where c.company_id = ? and ref.value = ?)
                    or exists(select 1 from company_profiles p where p.company_id = ? and (p.logo_asset_id = ? or p.storefront_asset_id = ?))
                """, Boolean.class, companyId, assetId, companyId, assetId, companyId, assetId,
                companyId, assetId.toString(), companyId, assetId, assetId));
    }

    private boolean isSymlinkEscape(Path path) throws IOException {
        if (!Files.exists(path)) return false;
        return !path.toRealPath().startsWith(storageRoot.toRealPath());
    }

    public static String normalizedMediaType(String fileName, String mediaType) {
        if (mediaType != null && !mediaType.equalsIgnoreCase("application/octet-stream")) return mediaType;
        var inferred = MediaTypeFactory.getMediaType(fileName).map(MediaType::toString).orElse(null);
        if (inferred != null && !inferred.equals(MediaType.APPLICATION_OCTET_STREAM_VALUE)) return inferred;
        if (fileName != null && fileName.toLowerCase(java.util.Locale.ROOT).endsWith(".bmp")) return "image/bmp";
        return mediaType == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : mediaType;
    }

    public static MediaType mediaType(String fileName) {
        return MediaType.parseMediaType(normalizedMediaType(fileName, null));
    }

    private StoredBusinessAsset throwNotFound() { throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "File was not found"); }
    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }

    public record BusinessAsset(UUID id, String fileName, String mediaType, long byteSize, Instant createdAt) { }
    public record StoredBusinessAsset(String fileName, String objectKey, String mediaType, Resource resource) {
        StoredBusinessAsset(String fileName, String objectKey, String mediaType) { this(fileName, objectKey, mediaType, null); }
        StoredBusinessAsset(String fileName, String objectKey, Resource resource) {
            this(fileName, objectKey, BusinessAssetService.mediaType(fileName).toString(), resource);
        }
        StoredBusinessAsset withResource(Resource resource) { return new StoredBusinessAsset(fileName, objectKey, mediaType, resource); }
    }
}

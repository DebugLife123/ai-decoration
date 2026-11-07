package com.decoration.business;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.decoration.shared.api.BusinessApiException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class BusinessAssetCleanupService {
    private static final Logger log = LoggerFactory.getLogger(BusinessAssetCleanupService.class);
    private static final int BATCH_SIZE = 500;

    private final JdbcTemplate jdbc;
    private final Path storageRoot;

    public BusinessAssetCleanupService(JdbcTemplate jdbc,
                                       @Value("${app.storage.local-dir:./var/uploads}") String storageDir) {
        this.jdbc = jdbc;
        this.storageRoot = Path.of(storageDir).toAbsolutePath().normalize();
    }

    @Scheduled(cron = "0 17 3 * * *")
    @Transactional
    public void cleanDaily() {
        var removed = cleanOrphanImagesCreatedBefore(Instant.now().minus(7, ChronoUnit.DAYS));
        if (removed > 0) log.info("Removed {} expired unreferenced business images", removed);
    }

    @Transactional
    public int cleanOrphanImagesCreatedBefore(Instant cutoff) {
        var candidates = jdbc.query("""
                        select a.company_id, a.id, a.object_key
                        from business_assets a
                        where a.media_type like 'image/%' and a.created_at < ?
                          and not exists (select 1 from business_case_files cf where cf.company_id = a.company_id and cf.file_id = a.id)
                          and not exists (select 1 from material_quote_images mi where mi.company_id = a.company_id and mi.image_id = a.id)
                          and not exists (select 1 from company_certification_documents cd where cd.company_id = a.company_id and cd.asset_id = a.id)
                          and not exists (
                              select 1 from company_certifications c,
                                  jsonb_array_elements_text(case when jsonb_typeof(c.document_refs) = 'array' then c.document_refs else '[]'::jsonb end) ref
                              where c.company_id = a.company_id and ref.value = a.id::text
                          )
                        order by a.company_id, a.id
                        limit ?
                        """,
                (rs, row) -> new Candidate(rs.getObject("company_id", UUID.class),
                        rs.getObject("id", UUID.class), rs.getString("object_key")), java.sql.Timestamp.from(cutoff), BATCH_SIZE);

        var removed = 0;
        for (var candidate : candidates) {
            lockCompany(candidate.companyId());
            var locked = jdbc.query("""
                            select object_key from business_assets
                            where company_id = ? and id = ? and media_type like 'image/%' and created_at < ?
                            for update
                            """, rs -> rs.next() ? rs.getString("object_key") : null,
                    candidate.companyId(), candidate.id(), java.sql.Timestamp.from(cutoff));
            if (locked == null || isReferenced(candidate.companyId(), candidate.id())) continue;

            var path = storageRoot.resolve(locked).normalize();
            boolean symlinkEscape;
            try {
                symlinkEscape = isSymlinkEscape(path);
            } catch (IOException exception) {
                log.warn("Could not validate business asset storage path: company={}, asset={}", candidate.companyId(), candidate.id(), exception);
                continue;
            }
            if (!path.startsWith(storageRoot) || symlinkEscape) {
                log.warn("Skipping business asset with an unsafe storage path: company={}, asset={}", candidate.companyId(), candidate.id());
                continue;
            }
            try {
                Files.deleteIfExists(path);
            } catch (IOException exception) {
                log.warn("Could not delete unreferenced business image: company={}, asset={}", candidate.companyId(), candidate.id(), exception);
                continue;
            }
            removed += jdbc.update("delete from business_assets where company_id = ? and id = ?",
                    candidate.companyId(), candidate.id());
        }
        return removed;
    }

    @Transactional
    public int cleanSelected(List<UUID> assetIds) {
        if (assetIds == null || assetIds.isEmpty() || assetIds.size() > BATCH_SIZE) return 0;
        var cutoff = Instant.now().minus(7, ChronoUnit.DAYS);
        var removed = 0;
        for (var assetId : assetIds.stream().distinct().toList()) {
            var candidate = jdbc.query("""
                            select company_id, object_key from business_assets
                            where id = ? and media_type like 'image/%' and created_at < ?
                            for update
                            """, rs -> rs.next() ? new Candidate(rs.getObject("company_id", UUID.class), assetId, rs.getString("object_key")) : null,
                    assetId, java.sql.Timestamp.from(cutoff));
            if (candidate == null) continue;
            lockCompany(candidate.companyId());
            if (isReferenced(candidate.companyId(), assetId)) continue;
            var path = storageRoot.resolve(candidate.objectKey()).normalize();
            try {
                if (!path.startsWith(storageRoot) || isSymlinkEscape(path)) continue;
                Files.deleteIfExists(path);
            } catch (IOException exception) {
                log.warn("Could not delete manually selected business image: company={}, asset={}", candidate.companyId(), assetId, exception);
                continue;
            }
            removed += jdbc.update("delete from business_assets where company_id = ? and id = ?",
                    candidate.companyId(), assetId);
        }
        return removed;
    }

    @Transactional(readOnly = true)
    public CleanupPreview preview() {
        var cutoff = Instant.now().minus(7, ChronoUnit.DAYS);
        var count = jdbc.queryForObject("""
                        select count(*)
                        from business_assets a
                        where a.media_type like 'image/%' and a.created_at < ?
                          and not exists (select 1 from business_case_files cf where cf.company_id = a.company_id and cf.file_id = a.id)
                          and not exists (select 1 from material_quote_images mi where mi.company_id = a.company_id and mi.image_id = a.id)
                          and not exists (select 1 from company_certification_documents cd where cd.company_id = a.company_id and cd.asset_id = a.id)
                          and not exists (
                              select 1 from company_certifications c,
                                  jsonb_array_elements_text(case when jsonb_typeof(c.document_refs) = 'array' then c.document_refs else '[]'::jsonb end) ref
                              where c.company_id = a.company_id and ref.value = a.id::text
                          )
                        """, Long.class, java.sql.Timestamp.from(cutoff));
        var candidates = jdbc.query("""
                        select a.company_id, coalesce(c.name, '未知企业') company_name, a.id, a.file_name,
                            a.object_key, a.created_at
                        from business_assets a
                        left join auth_companies c on c.id = a.company_id
                        where a.media_type like 'image/%' and a.created_at < ?
                          and not exists (select 1 from business_case_files cf where cf.company_id = a.company_id and cf.file_id = a.id)
                          and not exists (select 1 from material_quote_images mi where mi.company_id = a.company_id and mi.image_id = a.id)
                          and not exists (select 1 from company_certification_documents cd where cd.company_id = a.company_id and cd.asset_id = a.id)
                          and not exists (
                              select 1 from company_certifications cert,
                                  jsonb_array_elements_text(case when jsonb_typeof(cert.document_refs) = 'array' then cert.document_refs else '[]'::jsonb end) ref
                              where cert.company_id = a.company_id and ref.value = a.id::text
                          )
                        order by a.created_at asc, a.company_id, a.id
                        limit ?
                        """, (rs, row) -> new CleanupCandidate(rs.getObject("company_id", UUID.class),
                        rs.getString("company_name"), rs.getObject("id", UUID.class), rs.getString("file_name"),
                        rs.getString("object_key"), rs.getTimestamp("created_at").toInstant(), 0),
                java.sql.Timestamp.from(cutoff), BATCH_SIZE);
        var details = new ArrayList<CleanupCandidate>();
        long bytes = 0;
        for (var candidate : candidates) {
            var path = storageRoot.resolve(candidate.objectKey()).normalize();
            try {
                if (!path.startsWith(storageRoot) || isSymlinkEscape(path)) continue;
                var size = Files.isRegularFile(path) ? Files.size(path) : 0;
                bytes += size;
                details.add(candidate.withByteSize(size));
            } catch (IOException exception) {
                log.warn("Could not inspect unreferenced business image: company={}, asset={}", candidate.companyId(), candidate.assetId(), exception);
            }
        }
        return new CleanupPreview(count == null ? 0 : count, bytes, cutoff, Instant.now(), details,
                Math.max(0, (count == null ? 0 : count) - candidates.size()));
    }

    @Transactional(readOnly = true)
    public CleanupImage getPreviewImage(UUID assetId) {
        var cutoff = Instant.now().minus(7, ChronoUnit.DAYS);
        var candidate = jdbc.query("""
                        select a.company_id, a.file_name, a.object_key, a.media_type
                        from business_assets a
                        where a.id = ? and a.media_type like 'image/%' and a.created_at < ?
                          and not exists (select 1 from business_case_files cf where cf.company_id = a.company_id and cf.file_id = a.id)
                          and not exists (select 1 from material_quote_images mi where mi.company_id = a.company_id and mi.image_id = a.id)
                          and not exists (select 1 from company_certification_documents cd where cd.company_id = a.company_id and cd.asset_id = a.id)
                          and not exists (
                              select 1 from company_certifications c,
                                  jsonb_array_elements_text(case when jsonb_typeof(c.document_refs) = 'array' then c.document_refs else '[]'::jsonb end) ref
                              where c.company_id = a.company_id and ref.value = a.id::text
                          )
                        """, rs -> rs.next() ? new ImageCandidate(rs.getObject("company_id", UUID.class),
                        rs.getString("file_name"), rs.getString("object_key"), rs.getString("media_type")) : null,
                assetId, java.sql.Timestamp.from(cutoff));
        if (candidate == null) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Cleanup candidate was not found");
        var path = storageRoot.resolve(candidate.objectKey()).normalize();
        try {
            if (!path.startsWith(storageRoot) || isSymlinkEscape(path) || !Files.isRegularFile(path)) {
                throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Cleanup image was not found");
            }
        } catch (IOException exception) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Cleanup image was not found");
        }
        return new CleanupImage(candidate.fileName(), candidate.mediaType(), new FileSystemResource(path));
    }

    private void lockCompany(UUID companyId) {
        jdbc.query("select id from auth_companies where id = ? for update", rs -> {
            if (rs.next()) return rs.getObject(1, UUID.class);
            return null;
        }, companyId);
    }

    private boolean isReferenced(UUID companyId, UUID assetId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from business_case_files where company_id = ? and file_id = ?)
                    or exists(select 1 from material_quote_images where company_id = ? and image_id = ?)
                    or exists(select 1 from company_certification_documents where company_id = ? and asset_id = ?)
                    or exists(select 1 from company_certifications c,
                              jsonb_array_elements_text(case when jsonb_typeof(c.document_refs) = 'array' then c.document_refs else '[]'::jsonb end) ref
                              where c.company_id = ? and ref.value = ?)
                """, Boolean.class, companyId, assetId, companyId, assetId, companyId, assetId,
                companyId, assetId.toString()));
    }

    private boolean isSymlinkEscape(Path path) throws IOException {
        if (!Files.exists(path)) return false;
        var realRoot = storageRoot.toRealPath();
        return !path.toRealPath().startsWith(realRoot);
    }

    public record CleanupPreview(long eligibleImageCount, long estimatedBytes, Instant cutoffAt, Instant generatedAt,
                                 List<CleanupCandidate> candidates, long remainingImageCount) { }
    public record CleanupCandidate(UUID companyId, String companyName, UUID assetId, String fileName,
                                  String objectKey, Instant uploadedAt, long byteSize) {
        CleanupCandidate withByteSize(long size) {
            return new CleanupCandidate(companyId, companyName, assetId, fileName, objectKey, uploadedAt, size);
        }
    }
    public record CleanupImage(String fileName, String mediaType, Resource resource) { }
    private record ImageCandidate(UUID companyId, String fileName, String objectKey, String mediaType) { }
    private record Candidate(UUID companyId, UUID id, String objectKey) { }
}

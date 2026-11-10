package com.decoration.project;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.PathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static com.decoration.project.AssetDataController.*;

@Service
public class AssetDataService {
    private final JdbcTemplate jdbc;
    private final Path storageRoot;

    public AssetDataService(JdbcTemplate jdbc, @Value("${app.storage.local-dir:./var/uploads}") String storageRoot) {
        this.jdbc = jdbc;
        this.storageRoot = Path.of(storageRoot).toAbsolutePath().normalize();
    }

    public Asset create(UUID ownerId, UUID projectId, AssetRequest request) {
        requireProject(ownerId, projectId);
        var id = UUID.randomUUID();
        var now = Instant.now();
        var objectKey = request.objectKey().trim();
        var requiredPrefix = ownerId + "/" + projectId + "/";
        if (!objectKey.startsWith(requiredPrefix) || objectKey.length() == requiredPrefix.length()) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Asset object key must belong to the current project");
        }
        jdbc.update("""
                insert into workspace_assets(owner_id, project_id, id, original_name, media_type, byte_size,
                    object_key, checksum_sha256, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, ownerId, projectId, id, request.originalName().trim(), request.mediaType().trim(), request.byteSize(),
                objectKey, blankToNull(request.checksumSha256()), Timestamp.from(now));
        return new Asset(id, projectId, request.originalName().trim(), request.mediaType().trim(), request.byteSize(),
                objectKey, blankToNull(request.checksumSha256()), now);
    }

    @Transactional
    public Asset upload(UUID ownerId, UUID projectId, MultipartFile file) {
        requireProject(ownerId, projectId);
        if (file == null || file.isEmpty() || file.getSize() > 15L * 1024 * 1024) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Image must be between 1 byte and 15 MB");
        }
        var mediaType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!List.of("image/jpeg", "image/png", "image/webp").contains(mediaType)) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Only JPEG, PNG, and WEBP images are supported");
        }
        var id = UUID.randomUUID();
        var objectKey = ownerId + "/" + projectId + "/" + id;
        var destination = storageRoot.resolve(objectKey).normalize();
        if (!destination.startsWith(storageRoot)) throw new IllegalStateException("Asset path escaped storage root");
        try {
            Files.createDirectories(destination.getParent());
            var bytes = file.getBytes();
            var checksum = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            Files.write(destination, bytes);
            var now = Instant.now();
            var originalName = safeFileName(file.getOriginalFilename());
            jdbc.update("""
                    insert into workspace_assets(owner_id, project_id, id, original_name, media_type, byte_size,
                        object_key, checksum_sha256, created_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, ownerId, projectId, id, originalName, mediaType, bytes.length, objectKey, checksum, Timestamp.from(now));
            return new Asset(id, projectId, originalName, mediaType, bytes.length, objectKey, checksum, now);
        } catch (Exception exception) {
            try { Files.deleteIfExists(destination); } catch (IOException ignored) { }
            throw new IllegalStateException("Unable to persist uploaded asset", exception);
        }
    }

    public StoredAsset content(UUID ownerId, UUID projectId, UUID assetId) {
        requireProject(ownerId, projectId);
        var rows = jdbc.<StoredAsset>query("""
                select original_name, media_type, object_key from workspace_assets
                where owner_id = ? and project_id = ? and id = ?
                """, (rs, row) -> new StoredAsset(rs.getString("original_name"), rs.getString("media_type"),
                storageRoot.resolve(rs.getString("object_key")).normalize()), ownerId, projectId, assetId);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Asset was not found");
        var asset = rows.getFirst();
        if (!asset.path().startsWith(storageRoot) || !Files.isRegularFile(asset.path())) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Asset content was not found");
        }
        return asset;
    }

    public List<Asset> list(UUID ownerId, UUID projectId) {
        requireProject(ownerId, projectId);
        return jdbc.query("""
                select id, project_id, original_name, media_type, byte_size, object_key, checksum_sha256, created_at
                from workspace_assets where owner_id = ? and project_id = ? order by created_at, id
                """, (rs, row) -> new Asset(rs.getObject("id", UUID.class), rs.getObject("project_id", UUID.class),
                rs.getString("original_name"), rs.getString("media_type"), rs.getLong("byte_size"),
                rs.getString("object_key"), rs.getString("checksum_sha256"), rs.getTimestamp("created_at").toInstant()),
                ownerId, projectId);
    }

    private void requireProject(UUID ownerId, UUID projectId) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from workspace_project_aggregates where company_id = ? and project_id = ?)
                """, Boolean.class, ownerId, projectId))) {
            throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Project was not found");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String safeFileName(String value) {
        var name = value == null ? "image" : Path.of(value).getFileName().toString();
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        return name.isBlank() ? "image" : name.substring(0, Math.min(name.length(), 255));
    }

    public record StoredAsset(String originalName, String mediaType, Path path) { }
}

package com.decoration.project;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.decoration.project.AssetDataController.*;

@Service
public class AssetDataService {
    private final JdbcTemplate jdbc;

    public AssetDataService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
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
}

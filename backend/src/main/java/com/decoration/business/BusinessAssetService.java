package com.decoration.business;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.UUID;

@Service
public class BusinessAssetService {
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
            Files.copy(file.getInputStream(), target, StandardCopyOption.COPY_ATTRIBUTES);
        } catch (IOException exception) {
            throw new BusinessApiException(HttpStatus.INTERNAL_SERVER_ERROR, "FILE_STORAGE_ERROR", "File could not be stored");
        }
        var name = Path.of(file.getOriginalFilename() == null ? "upload" : file.getOriginalFilename()).getFileName().toString();
        jdbc.update("insert into business_assets(company_id, id, file_name, object_key, created_at) values (?, ?, ?, ?, ?)",
                companyId, id, name, objectKey, java.sql.Timestamp.from(Instant.now()));
        return new BusinessAsset(id, name, mediaType, file.getSize(), Instant.now());
    }

    public StoredBusinessAsset get(UUID companyId, UUID assetId) {
        var result = jdbc.query("select file_name, object_key from business_assets where company_id = ? and id = ?",
                rs -> rs.next() ? new StoredBusinessAsset(rs.getString("file_name"), rs.getString("object_key")) : null,
                companyId, assetId);
        if (result == null) throwNotFound();
        var path = storageRoot.resolve(result.objectKey()).normalize();
        if (!path.startsWith(storageRoot) || !Files.isRegularFile(path)) throwNotFound();
        return result.withResource(new FileSystemResource(path));
    }

    private StoredBusinessAsset throwNotFound() { throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "File was not found"); }
    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }

    public record BusinessAsset(UUID id, String fileName, String mediaType, long byteSize, Instant createdAt) { }
    public record StoredBusinessAsset(String fileName, String objectKey, Resource resource) {
        StoredBusinessAsset(String fileName, String objectKey) { this(fileName, objectKey, null); }
        StoredBusinessAsset withResource(Resource resource) { return new StoredBusinessAsset(fileName, objectKey, resource); }
    }
}

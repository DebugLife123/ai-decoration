package com.decoration.auth;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class UserProfileAssetService {
    private static final long MAX_AVATAR_BYTES = 5L * 1024 * 1024;
    private static final Map<String, String> ALLOWED_TYPES = Map.of(
            ".jpg", "image/jpeg", ".jpeg", "image/jpeg", ".png", "image/png",
            ".webp", "image/webp", ".gif", "image/gif", ".bmp", "image/bmp");

    private final JdbcTemplate jdbc;
    private final Path storageRoot;

    public UserProfileAssetService(JdbcTemplate jdbc,
                                   @Value("${app.storage.local-dir:./var/uploads}") String storageDir) {
        this.jdbc = jdbc;
        this.storageRoot = Path.of(storageDir).toAbsolutePath().normalize();
    }

    @Transactional
    public UUID upload(UUID userId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw invalid("请选择头像图片");
        if (file.getSize() > MAX_AVATAR_BYTES) {
            throw new BusinessApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "头像不能超过 5 MB");
        }
        var originalName = Path.of(file.getOriginalFilename() == null ? "avatar" : file.getOriginalFilename())
                .getFileName().toString();
        var mediaType = mediaType(originalName);
        var rows = jdbc.query("select avatar_object_key from auth_users where id = ? for update",
                (rs, row) -> rs.getString("avatar_object_key"), userId);
        if (rows.isEmpty()) throw unauthorized();

        var avatarId = UUID.randomUUID();
        var objectKey = "users/" + userId + "/avatars/" + avatarId;
        var target = resolve(objectKey);
        try {
            Files.createDirectories(target.getParent());
            try (InputStream input = file.getInputStream()) { Files.copy(input, target); }
        } catch (IOException exception) {
            throw new BusinessApiException(HttpStatus.INTERNAL_SERVER_ERROR, "FILE_STORAGE_ERROR", "头像保存失败");
        }

        var oldObjectKey = rows.getFirst();
        jdbc.update("""
                update auth_users
                set avatar_id = ?, avatar_file_name = ?, avatar_media_type = ?, avatar_object_key = ?, profile_updated_at = ?
                where id = ?
                """, avatarId, originalName, mediaType, objectKey, Timestamp.from(Instant.now()), userId);
        registerFileCleanup(target, oldObjectKey);
        return avatarId;
    }

    public StoredAvatar get(UUID userId) {
        var rows = jdbc.query("""
                        select avatar_file_name, avatar_media_type, avatar_object_key
                        from auth_users where id = ? and avatar_id is not null
                        """, (rs, row) -> new StoredAvatar(rs.getString("avatar_file_name"),
                        rs.getString("avatar_media_type"), rs.getString("avatar_object_key"), null), userId);
        if (rows.isEmpty()) throw new BusinessApiException(HttpStatus.NOT_FOUND, "AVATAR_NOT_FOUND", "尚未设置头像");
        var avatar = rows.getFirst();
        var path = resolve(avatar.objectKey());
        if (!Files.isRegularFile(path)) throw new BusinessApiException(HttpStatus.NOT_FOUND, "AVATAR_NOT_FOUND", "头像文件不存在");
        return new StoredAvatar(avatar.fileName(), avatar.mediaType(), avatar.objectKey(), new FileSystemResource(path));
    }

    @Transactional
    public void remove(UUID userId) {
        var rows = jdbc.query("select avatar_object_key from auth_users where id = ? for update",
                (rs, row) -> rs.getString("avatar_object_key"), userId);
        if (rows.isEmpty()) throw unauthorized();
        var oldObjectKey = rows.getFirst();
        jdbc.update("""
                update auth_users
                set avatar_id = null, avatar_file_name = null, avatar_media_type = null,
                    avatar_object_key = null, profile_updated_at = ?
                where id = ?
                """, Timestamp.from(Instant.now()), userId);
        if (oldObjectKey != null) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { deleteQuietly(resolve(oldObjectKey)); }
            });
        }
    }

    private void registerFileCleanup(Path newFile, String oldObjectKey) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                if (oldObjectKey != null) deleteQuietly(resolve(oldObjectKey));
            }
            @Override public void afterCompletion(int status) {
                if (status != TransactionSynchronization.STATUS_COMMITTED) deleteQuietly(newFile);
            }
        });
    }

    private Path resolve(String objectKey) {
        var path = storageRoot.resolve(objectKey).normalize();
        if (!path.startsWith(storageRoot)) throw invalid("头像路径无效");
        return path;
    }

    private static String mediaType(String fileName) {
        var lowerName = fileName.toLowerCase(Locale.ROOT);
        var dot = lowerName.lastIndexOf('.');
        var extension = dot >= 0 ? lowerName.substring(dot) : "";
        var type = ALLOWED_TYPES.get(extension);
        if (type == null) throw new BusinessApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "UNSUPPORTED_MEDIA_TYPE", "仅支持 JPG、PNG、WEBP、GIF 或 BMP 图片");
        return type;
    }

    private static void deleteQuietly(Path path) {
        try { Files.deleteIfExists(path); } catch (IOException ignored) { }
    }

    private static BusinessApiException invalid(String message) {
        return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
    }

    private static BusinessApiException unauthorized() {
        return new BusinessApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "账号不存在或已失效");
    }

    public record StoredAvatar(String fileName, String mediaType, String objectKey, Resource resource) { }
}

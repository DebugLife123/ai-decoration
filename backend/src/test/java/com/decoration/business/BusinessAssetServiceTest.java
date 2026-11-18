package com.decoration.business;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import com.decoration.shared.api.BusinessApiException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class BusinessAssetServiceTest {
    private static final long MAX_FILE_SIZE = 15L * 1024 * 1024;

    @TempDir
    Path storageRoot;

    @Test
    void uploadsMultipartFileToLocalStorage() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var service = new BusinessAssetService(jdbc, storageRoot.toString(), MAX_FILE_SIZE);
        var companyId = UUID.randomUUID();
        var contents = new byte[]{1, 2, 3};
        var file = new MockMultipartFile("file", "case.png", "image/png", contents);

        var uploaded = service.upload(companyId, file);

        assertEquals("case.png", uploaded.fileName());
        assertArrayEquals(contents, Files.readAllBytes(storageRoot.resolve(companyId.toString()).resolve(uploaded.id().toString())));
        verify(jdbc).update(any(String.class), eq(companyId), eq(uploaded.id()), eq("case.png"),
                eq(companyId + "/" + uploaded.id()), eq("image/png"), any(java.sql.Timestamp.class));
    }

    @Test
    void rejectsSvgBecauseItCanCarryScript() {
        var service = new BusinessAssetService(mock(JdbcTemplate.class), storageRoot.toString(), MAX_FILE_SIZE);
        var file = new MockMultipartFile("file", "logo.svg", "image/svg+xml", "<svg/>".getBytes());

        var error = assertThrows(BusinessApiException.class, () -> service.upload(UUID.randomUUID(), file));

        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, error.status());
    }

    @Test
    void rejectsDisallowedExtensionEvenWhenContentTypeLooksFine() {
        var service = new BusinessAssetService(mock(JdbcTemplate.class), storageRoot.toString(), MAX_FILE_SIZE);
        // 声明 image/png 但文件名是 .svg —— 扩展名白名单必须拦住
        var file = new MockMultipartFile("file", "payload.svg", "image/png", "<svg/>".getBytes());

        var error = assertThrows(BusinessApiException.class, () -> service.upload(UUID.randomUUID(), file));

        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, error.status());
    }

    @Test
    void acceptsBmpWhenContentTypeIsGenericBinary() throws Exception {
        var service = new BusinessAssetService(mock(JdbcTemplate.class), storageRoot.toString(), MAX_FILE_SIZE);
        var file = new MockMultipartFile("file", "hajimi4.bmp", "application/octet-stream", new byte[]{1});

        var uploaded = service.upload(UUID.randomUUID(), file);

        assertEquals("image/bmp", uploaded.mediaType());
    }

    @Test
    void rejectsFileLargerThanConfiguredLimit() {
        var service = new BusinessAssetService(mock(JdbcTemplate.class), storageRoot.toString(), 2);
        var file = new MockMultipartFile("file", "big.png", "image/png", new byte[]{1, 2, 3});

        var error = assertThrows(BusinessApiException.class, () -> service.upload(UUID.randomUUID(), file));

        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, error.status());
    }

    @Test
    void recognizesBmpWhenBrowserReportsGenericBinaryType() {
        assertEquals("image/bmp", BusinessAssetService.normalizedMediaType("hajimi4.bmp", "application/octet-stream"));
    }

    @Test
    void checksWhetherAnUploadedObjectStillExists() throws Exception {
        var service = new BusinessAssetService(mock(JdbcTemplate.class), storageRoot.toString(), MAX_FILE_SIZE);
        var objectKey = "company/file-id";

        assertFalse(service.isFileAvailable(objectKey));
        Files.createDirectories(storageRoot.resolve("company"));
        Files.write(storageRoot.resolve(objectKey), new byte[]{1});

        assertTrue(service.isFileAvailable(objectKey));
        assertFalse(service.isFileAvailable("../outside"));
    }
}

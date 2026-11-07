package com.decoration.business;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class BusinessAssetServiceTest {
    @TempDir
    Path storageRoot;

    @Test
    void uploadsMultipartFileToLocalStorage() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var service = new BusinessAssetService(jdbc, storageRoot.toString());
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
    void recognizesBmpWhenBrowserReportsGenericBinaryType() {
        assertEquals("image/bmp", BusinessAssetService.normalizedMediaType("hajimi4.bmp", "application/octet-stream"));
    }

    @Test
    void checksWhetherAnUploadedObjectStillExists() throws Exception {
        var service = new BusinessAssetService(mock(JdbcTemplate.class), storageRoot.toString());
        var objectKey = "company/file-id";

        assertFalse(service.isFileAvailable(objectKey));
        Files.createDirectories(storageRoot.resolve("company"));
        Files.write(storageRoot.resolve(objectKey), new byte[]{1});

        assertTrue(service.isFileAvailable(objectKey));
        assertFalse(service.isFileAvailable("../outside"));
    }
}

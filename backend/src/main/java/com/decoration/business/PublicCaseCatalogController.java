package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static com.decoration.business.PublicCaseCatalogDtos.*;

@RestController
@Validated
@RequestMapping("/api/v1/cases")
@PreAuthorize("hasRole('PERSONAL_USER')")
public class PublicCaseCatalogController {
    private final PublicCaseCatalogService catalog;
    private final BusinessAssetService assets;

    public PublicCaseCatalogController(PublicCaseCatalogService catalog, BusinessAssetService assets) {
        this.catalog = catalog;
        this.assets = assets;
    }

    @GetMapping
    public ApiResponse<Page<PublicCase>> list(@RequestParam(required = false) @Size(max = 120) String query,
            @RequestParam(required = false) @Size(max = 80) String style,
            @RequestParam(required = false) @Size(max = 80) String city,
            @RequestParam(required = false) @DecimalMin("0.0") BigDecimal minArea,
            @RequestParam(required = false) @DecimalMin("0.0") BigDecimal maxArea,
            @RequestParam(required = false) @DecimalMin("0.0") BigDecimal minBudget,
            @RequestParam(required = false) @DecimalMin("0.0") BigDecimal maxBudget,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "24") @Min(1) @Max(100) int size) {
        return ApiResponse.success(catalog.list(query, style, city, minArea, maxArea, minBudget, maxBudget, page, size));
    }

    @GetMapping("/{caseId}/files/{fileId}")
    public ResponseEntity<Resource> file(@PathVariable UUID caseId, @PathVariable UUID fileId) {
        var file = assets.getPublicCaseFile(caseId, fileId);
        var disposition = ContentDisposition.inline().filename(file.fileName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.mediaType()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString()).body(file.resource());
    }
}

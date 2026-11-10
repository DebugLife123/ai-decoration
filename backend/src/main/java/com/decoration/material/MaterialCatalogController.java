package com.decoration.material;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static com.decoration.material.MaterialCatalogDtos.CatalogMaterial;
import static com.decoration.material.MaterialCatalogDtos.Page;

/**
 * C 端只读材料目录。任何已登录账号（含个人用户）都可读取，
 * 数据只来自已认证企业录入且未过期的报价。
 */
@RestController
@Validated
@RequestMapping("/api/v1/materials")
public class MaterialCatalogController {
    private final MaterialCatalogService service;

    public MaterialCatalogController(MaterialCatalogService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('PERSONAL_USER', 'COMPANY_ADMIN', 'COMPANY_EDITOR', 'COMPANY_VIEWER')")
    public ApiResponse<Page<CatalogMaterial>> list(
            @RequestParam(required = false) @Size(max = 80) String region,
            @RequestParam(required = false) @Size(max = 80) String category,
            @RequestParam(required = false) @Size(max = 120) String query,
            @RequestParam(defaultValue = "false") boolean includeExpired,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(defaultValue = "updatedAt") @Size(max = 40) String sort) {
        return ApiResponse.success(service.list(region, category, query, includeExpired, page, size, sort));
    }
}

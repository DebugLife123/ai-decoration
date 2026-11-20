package com.decoration.material;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static com.decoration.material.MaterialCatalogDtos.CatalogMaterial;
import static com.decoration.material.MaterialCatalogDtos.Page;

/**
 * C 端公开只读材料目录，访客可浏览已审核的展示报价。
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
    public ApiResponse<Page<CatalogMaterial>> list(
            @RequestParam(required = false) @Size(max = 80) String region,
            @RequestParam(required = false) @Size(max = 80) String category,
            @RequestParam(required = false) @Size(max = 120) String query,
            @RequestParam(required = false) @Size(max = 40) String styleKey,
            @RequestParam(defaultValue = "false") boolean includeExpired,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(defaultValue = "updatedAt") @Size(max = 40) String sort) {
        return ApiResponse.success(service.list(region, category, query, styleKey, includeExpired, page, size, sort));
    }
}

package com.decoration.budget;

import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import static com.decoration.budget.DesignStylePromptService.StylePrompt;
import static com.decoration.budget.DesignStylePromptService.StyleCatalogItem;

@RestController
@Validated
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
@RequestMapping("/api/v1/admin/design-style-prompts")
public class AdminDesignStylePromptController {
    private final DesignStylePromptService service;
    private final JdbcTemplate jdbc;

    public AdminDesignStylePromptController(DesignStylePromptService service, JdbcTemplate jdbc) {
        this.service = service;
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResponse<List<StylePrompt>> list() {
        return ApiResponse.success(service.list());
    }

    @GetMapping("/catalog")
    public ApiResponse<List<StyleCatalogItem>> catalog() {
        return ApiResponse.success(service.catalog());
    }

    @org.springframework.web.bind.annotation.PostMapping
    public ApiResponse<StyleCatalogItem> create(@AuthenticationPrincipal Jwt jwt,
                                                  @Valid @RequestBody CreateStyleRequest request) {
        var adminId = UUID.fromString(jwt.getSubject());
        var created = service.create(request.styleKey(), request.styleName(), request.prompt(),
                request.priceLowPerSqm(), request.priceHighPerSqm(), request.materialFactor(), adminId);
        jdbc.update("""
                insert into admin_audit_logs(id, actor_id, action, target_type, target_id, description, created_at)
                values (?, ?, 'DESIGN_STYLE_CREATED', 'DESIGN_STYLE', ?, ?, now())
                """, UUID.randomUUID(), adminId, UUID.nameUUIDFromBytes(request.styleKey().getBytes()),
                request.styleKey() + " / " + request.styleName() + " 已新增");
        return ApiResponse.success(created);
    }

    @PutMapping("/{key}")
    public ApiResponse<StylePrompt> update(@AuthenticationPrincipal Jwt jwt, @PathVariable String key,
                                           @Valid @RequestBody UpdatePromptRequest request) {
        var adminId = UUID.fromString(jwt.getSubject());
        var updated = service.update(key, request.prompt(), adminId);
        jdbc.update("""
                insert into admin_audit_logs(id, actor_id, action, target_type, target_id, description, created_at)
                values (?, ?, 'DESIGN_STYLE_PROMPT_UPDATED', 'DESIGN_STYLE_PROMPT', ?, ?, now())
                """, UUID.randomUUID(), adminId, UUID.nameUUIDFromBytes(key.getBytes()), key + " 生图提示词已更新");
        return ApiResponse.success(updated);
    }

    @DeleteMapping("/{key}")
    @org.springframework.transaction.annotation.Transactional
    public ApiResponse<Boolean> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String key) {
        var adminId = UUID.fromString(jwt.getSubject());
        service.delete(key);
        jdbc.update("""
                insert into admin_audit_logs(id, actor_id, action, target_type, target_id, description, created_at)
                values (?, ?, 'DESIGN_STYLE_DELETED', 'DESIGN_STYLE', ?, ?, now())
                """, UUID.randomUUID(), adminId, UUID.nameUUIDFromBytes(key.getBytes()), key + " 风格已删除");
        return ApiResponse.success(true);
    }

    public record UpdatePromptRequest(@NotBlank @Size(max = 12000) String prompt) { }
    public record CreateStyleRequest(
            @NotBlank @Pattern(regexp = "[a-z][a-z0-9-]{1,39}") String styleKey,
            @NotBlank @Size(max = 80) String styleName,
            @NotBlank @Size(max = 12000) String prompt,
            @jakarta.validation.constraints.NotNull @DecimalMin("100") @DecimalMax("10000") BigDecimal priceLowPerSqm,
            @jakarta.validation.constraints.NotNull @DecimalMin("100") @DecimalMax("10000") BigDecimal priceHighPerSqm,
            @jakarta.validation.constraints.NotNull @DecimalMin("0.5") @DecimalMax("2.0") BigDecimal materialFactor) { }
}

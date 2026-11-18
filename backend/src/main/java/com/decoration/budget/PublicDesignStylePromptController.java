package com.decoration.budget;

import com.decoration.shared.api.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.decoration.budget.DesignStylePromptService.StylePrompt;
import static com.decoration.budget.DesignStylePromptService.StyleCatalogItem;

@RestController
@RequestMapping("/api/v1/styles")
public class PublicDesignStylePromptController {
    private final DesignStylePromptService service;

    public PublicDesignStylePromptController(DesignStylePromptService service) {
        this.service = service;
    }

    @GetMapping("/generation-prompts")
    public ApiResponse<List<StylePrompt>> list() {
        return ApiResponse.success(service.list());
    }

    @GetMapping("/catalog")
    public ApiResponse<List<StyleCatalogItem>> catalog() {
        return ApiResponse.success(service.catalog());
    }
}

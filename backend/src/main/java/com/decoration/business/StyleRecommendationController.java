package com.decoration.business;

import com.decoration.shared.api.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.decoration.business.StyleDtos.RecommendationProfile;

/**
 * C 端风格推荐数据源：汇总已认证企业公开的风格资料。
 * 推荐排序仍在前端按预算/面积/地区计算，这里只负责给出候选集合。
 */
@RestController
@RequestMapping("/api/v1/styles")
public class StyleRecommendationController {
    private final StyleProfileService service;

    public StyleRecommendationController(StyleProfileService service) {
        this.service = service;
    }

    /** 公开只读：预算试算页在登录前也可能展示风格推荐。 */
    @GetMapping("/recommendations")
    public ApiResponse<List<RecommendationProfile>> recommendations() {
        return ApiResponse.success(service.publishedProfiles());
    }
}

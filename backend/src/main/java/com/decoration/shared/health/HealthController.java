package com.decoration.shared.health;

import com.decoration.shared.api.ApiResponse;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/health")
public class HealthController {

    private final HealthEndpoint healthEndpoint;

    public HealthController(HealthEndpoint healthEndpoint) {
        this.healthEndpoint = healthEndpoint;
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> health() {
        var health = healthEndpoint.health();
        return ApiResponse.success(Map.of("status", health.getStatus().getCode()));
    }
}

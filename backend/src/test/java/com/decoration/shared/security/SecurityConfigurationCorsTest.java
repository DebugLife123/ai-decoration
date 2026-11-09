package com.decoration.shared.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecurityConfigurationCorsTest {

    @Test
    void allowsProductionFrontendAndRejectsUnlistedOrigins() {
        var source = new SecurityConfiguration().corsConfigurationSource(
                "http://localhost:5177,http://www.openai2api.com:4175");

        assertOriginAllowed(source.getCorsConfiguration(requestFrom("http://www.openai2api.com:4175")));
        var unlisted = source.getCorsConfiguration(requestFrom("https://untrusted.example"));
        assertFalse(unlisted.checkOrigin("https://untrusted.example") != null);
    }

    private static MockHttpServletRequest requestFrom(String origin) {
        var request = new MockHttpServletRequest();
        request.addHeader("Origin", origin);
        return request;
    }

    private static void assertOriginAllowed(CorsConfiguration configuration) {
        assertTrue(configuration.checkOrigin("http://www.openai2api.com:4175") != null);
    }
}

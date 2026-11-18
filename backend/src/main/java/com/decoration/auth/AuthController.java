package com.decoration.auth;

import com.decoration.auth.AuthDtos.AuthResponse;
import com.decoration.auth.AuthDtos.LoginRequest;
import com.decoration.auth.AuthDtos.RegisterRequest;
import com.decoration.shared.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.Resource;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.ContentDisposition;
import jakarta.servlet.http.HttpServletRequest;

import java.nio.charset.StandardCharsets;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService service;
    private final UserProfileAssetService profileAssets;

    public AuthController(AuthService service, UserProfileAssetService profileAssets) {
        this.service = service;
        this.profileAssets = profileAssets;
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.register(request, httpRequest.getHeader("User-Agent"), httpRequest.getRemoteAddr())));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return ApiResponse.success(service.login(request, httpRequest.getHeader("User-Agent"), httpRequest.getRemoteAddr()));
    }

    @PostMapping("/admin/login")
    public ApiResponse<AuthResponse> adminLogin(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return ApiResponse.success(service.adminLogin(request, httpRequest.getHeader("User-Agent"), httpRequest.getRemoteAddr()));
    }

    @GetMapping("/me")
    public ApiResponse<AuthDtos.User> me(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.currentUser(UUID.fromString(jwt.getSubject())));
    }

    @PatchMapping("/me")
    public ApiResponse<AuthDtos.User> updateMe(@AuthenticationPrincipal Jwt jwt,
                                                @Valid @RequestBody AuthDtos.UpdateProfileRequest request) {
        return ApiResponse.success(service.updateProfile(UUID.fromString(jwt.getSubject()), request));
    }

    @PatchMapping("/me/password")
    public ApiResponse<Void> changePassword(@AuthenticationPrincipal Jwt jwt,
                                             @Valid @RequestBody AuthDtos.ChangePasswordRequest request) {
        service.changePassword(userId(jwt), sessionId(jwt), request);
        return ApiResponse.success(null);
    }

    @GetMapping("/me/sessions")
    public ApiResponse<java.util.List<AuthDtos.UserSession>> sessions(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(service.sessions(userId(jwt), sessionId(jwt)));
    }

    @DeleteMapping("/me/sessions/others")
    public ApiResponse<Void> revokeOtherSessions(@AuthenticationPrincipal Jwt jwt) {
        service.revokeOtherSessions(userId(jwt), sessionId(jwt));
        return ApiResponse.success(null);
    }

    @DeleteMapping("/me/sessions/current")
    public ApiResponse<Void> revokeCurrentSession(@AuthenticationPrincipal Jwt jwt) {
        service.revokeSession(userId(jwt), sessionId(jwt));
        return ApiResponse.success(null);
    }

    @DeleteMapping("/me/sessions/{sessionId}")
    public ApiResponse<Void> revokeSession(@AuthenticationPrincipal Jwt jwt, @org.springframework.web.bind.annotation.PathVariable UUID sessionId) {
        service.revokeSession(userId(jwt), sessionId);
        return ApiResponse.success(null);
    }

    @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<AuthDtos.User> uploadAvatar(@AuthenticationPrincipal Jwt jwt,
                                                    @RequestPart("file") MultipartFile file) {
        var userId = UUID.fromString(jwt.getSubject());
        profileAssets.upload(userId, file);
        return ApiResponse.success(service.currentUser(userId));
    }

    @GetMapping("/me/avatar")
    public ResponseEntity<Resource> avatar(@AuthenticationPrincipal Jwt jwt) {
        var avatar = profileAssets.get(UUID.fromString(jwt.getSubject()));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(avatar.mediaType()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(avatar.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(avatar.resource());
    }

    @DeleteMapping("/me/avatar")
    public ApiResponse<AuthDtos.User> removeAvatar(@AuthenticationPrincipal Jwt jwt) {
        var userId = UUID.fromString(jwt.getSubject());
        profileAssets.remove(userId);
        return ApiResponse.success(service.currentUser(userId));
    }

    private static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    private static UUID sessionId(Jwt jwt) {
        var id = jwt.getId();
        if (id == null || id.isBlank()) throw new com.decoration.shared.api.BusinessApiException(HttpStatus.UNAUTHORIZED, "SESSION_INVALID", "当前登录会话无效，请重新登录");
        return UUID.fromString(id);
    }
}

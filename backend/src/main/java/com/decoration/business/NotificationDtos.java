package com.decoration.business;

import java.time.Instant;

public final class NotificationDtos {
    private NotificationDtos() { }

    public enum NotificationType {
        CERTIFICATION,
        CERTIFICATION_PAYMENT,
        QUOTE_EXPIRING,
        INQUIRY,
        ADMIN_REVIEW,
        ADMIN_PAYMENT,
        ADMIN_SUBSCRIPTION,
        MATERIAL_REVIEW
    }

    public record Notification(String key, NotificationType type, String title, String message,
                               String link, Instant createdAt, boolean read) { }
}

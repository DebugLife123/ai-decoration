package com.decoration.business;

import java.time.Instant;

public final class NotificationDtos {
    private NotificationDtos() { }

    public enum NotificationType { CERTIFICATION, QUOTE_EXPIRING, INQUIRY, ADMIN_REVIEW }

    public record Notification(String key, NotificationType type, String title, String message,
                               String link, Instant createdAt, boolean read) { }
}

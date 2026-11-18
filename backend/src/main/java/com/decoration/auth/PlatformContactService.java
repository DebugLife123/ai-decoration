package com.decoration.auth;

import com.decoration.business.AdminAuditLogService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;
import static com.decoration.auth.PlatformContactDtos.*;

@Service
public class PlatformContactService {
    private final JdbcTemplate jdbc;
    private final AdminAuditLogService audit;

    public PlatformContactService(JdbcTemplate jdbc, AdminAuditLogService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public PublicContact publicContact() {
        return jdbc.queryForObject("select contact_name, phone, email, wechat, message from platform_contact_settings where id = 1",
                (rs, row) -> new PublicContact(rs.getString("contact_name"), rs.getString("phone"),
                        rs.getString("email"), rs.getString("wechat"), rs.getString("message")));
    }

    public ContactSettings settings() {
        return jdbc.queryForObject("select contact_name, phone, email, wechat, message, updated_at from platform_contact_settings where id = 1",
                (rs, row) -> new ContactSettings(rs.getString("contact_name"), rs.getString("phone"),
                        rs.getString("email"), rs.getString("wechat"), rs.getString("message"),
                        rs.getTimestamp("updated_at").toInstant()));
    }

    @Transactional
    public ContactSettings update(UUID actorId, UpdateRequest request) {
        jdbc.update("update platform_contact_settings set contact_name = ?, phone = ?, email = ?, wechat = ?, message = ?, updated_at = now(), updated_by = ? where id = 1",
                request.contactName().trim(), request.phone().trim(), request.email().trim(), request.wechat().trim(), request.message().trim(), actorId);
        audit.record(actorId, "PLATFORM_CONTACT_UPDATE", "PLATFORM_SETTINGS", null, "更新停用账号联系信息");
        return settings();
    }

}

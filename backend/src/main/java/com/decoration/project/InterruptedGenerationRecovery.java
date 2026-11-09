package com.decoration.project;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;

@Component
public class InterruptedGenerationRecovery {
    private static final String RESTART_MESSAGE = "服务重启时该生成任务仍在执行，模型请求未能续跑；可从项目记录中重新尝试。";
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public InterruptedGenerationRecovery(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void markInterruptedTasks() {
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                update generation_tasks set status = 'FAILED', error_message = ?,
                    started_at = coalesce(started_at, created_at), completed_at = ?
                where status in ('QUEUED', 'RUNNING')
                """, RESTART_MESSAGE, now);
        var projects = jdbc.<StoredProject>query("select company_id, project_id, project_json from workspace_project_aggregates",
                (rs, row) -> new StoredProject(rs.getObject("company_id", java.util.UUID.class),
                        rs.getObject("project_id", java.util.UUID.class), (ObjectNode) read(rs.getString("project_json"))));
        for (var stored : projects) {
            if (!stored.project().path("tasks").isArray()) continue;
            var changed = false;
            for (JsonNode node : stored.project().path("tasks")) {
                if (!(node instanceof ObjectNode task) || !"generating".equalsIgnoreCase(task.path("status").asText())) continue;
                task.put("status", "failed");
                task.put("error", RESTART_MESSAGE);
                task.put("completedAt", now.toInstant().toString());
                changed = true;
            }
            if (changed) {
                stored.project().put("status", "failed");
                jdbc.update("update workspace_project_aggregates set project_json = ?::jsonb, updated_at = ? where company_id = ? and project_id = ?",
                        stored.project().toString(), now, stored.ownerId(), stored.projectId());
            }
        }
    }

    private JsonNode read(String value) {
        try { return objectMapper.readTree(value); }
        catch (Exception exception) { throw new IllegalStateException("Stored project JSON is invalid", exception); }
    }

    private record StoredProject(java.util.UUID ownerId, java.util.UUID projectId, ObjectNode project) { }
}

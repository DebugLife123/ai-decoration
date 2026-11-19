package com.decoration.project;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class ProjectHistoryService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    private final com.decoration.saas.SaasSubscriptionService subscriptions;
    public ProjectHistoryService(JdbcTemplate jdbc, ObjectMapper objectMapper, com.decoration.saas.SaasSubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void synchronize(UUID ownerId, UUID projectId, JsonNode project) {
        var tasks = readItems(project, "tasks");
        var versions = readItems(project, "versions");
        var now = Instant.now();
        var taskRows = tasks.stream().map(item -> taskRow(projectId, item, now)).toList();
        var versionRows = new ArrayList<VersionRow>();
        for (int index = 0; index < versions.size(); index++) {
            versionRows.add(versionRow(projectId, versions.get(index), index + 1, now));
        }

        for (var row : taskRows) {
            jdbc.update("""
                    insert into generation_tasks(owner_id, project_id, id, task_type, status, input_json,
                        result_json, error_message, attempt_count, created_at, started_at, completed_at, heartbeat_at)
                    values (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, 0, ?, ?, ?, ?)
                    on conflict (owner_id, id) do update set task_type = excluded.task_type,
                        status = excluded.status, input_json = excluded.input_json,
                        result_json = excluded.result_json,
                        error_message = excluded.error_message, started_at = excluded.started_at,
                        completed_at = excluded.completed_at
                    where generation_tasks.project_id = excluded.project_id
                    """, ownerId, projectId, row.id(), row.type(), row.status(), row.payload(), row.result(), row.error(),
                    Timestamp.from(row.createdAt()), row.startedAt() == null ? null : Timestamp.from(row.startedAt()),
                    row.completedAt() == null ? null : Timestamp.from(row.completedAt()),
                    // Synced tasks must look alive immediately, otherwise the stale-task sweeper
                    // cannot tell a live browser run from a row that never reported progress.
                    Timestamp.from(row.startedAt() == null ? row.createdAt() : row.startedAt()));
        }
        for (var row : versionRows) {
            var nextVersion = jdbc.queryForObject("""
                    select coalesce(max(version_number), 0) + 1 from project_versions
                    where owner_id = ? and project_id = ?
                    """, Integer.class, ownerId, projectId);
            jdbc.update("""
                    insert into project_versions(owner_id, project_id, id, version_number, snapshot_json, created_at)
                    values (?, ?, ?, ?, ?::jsonb, ?)
                    on conflict (owner_id, id) do update set snapshot_json = excluded.snapshot_json
                    where project_versions.project_id = excluded.project_id
                    """, ownerId, projectId, row.id(), nextVersion, row.payload(), Timestamp.from(row.createdAt()));
        }
    }

    public List<JsonNode> listVersions(UUID ownerId, UUID projectId) {
        requireProject(ownerId, projectId);
        return jdbc.query("""
                select snapshot_json from project_versions where owner_id = ? and project_id = ?
                order by version_number desc
                """, (rs, row) -> readJson(rs.getString("snapshot_json")), ownerId, projectId);
    }

    public List<JsonNode> listTasks(UUID ownerId, UUID projectId) {
        requireProject(ownerId, projectId);
        return jdbc.query("""
                select input_json, result_json, status, error_message, retry_count, max_attempts,
                    attempt_count, manual_retry_count, created_at, started_at, completed_at,
                    stage, progress, progress_message, completed_rooms, total_rooms
                from generation_tasks where owner_id = ? and project_id = ? order by created_at desc, id
                """, (rs, row) -> {
                    var task = readJson(rs.getString("input_json"));
                    ((ObjectNode) task).put("status", rs.getString("status"));
                    var error = rs.getString("error_message");
                    if (error != null) ((ObjectNode) task).put("error", error);
                    ((ObjectNode) task).put("retryCount", rs.getInt("retry_count"));
                    ((ObjectNode) task).put("maxAttempts", rs.getInt("max_attempts"));
                    ((ObjectNode) task).put("attemptCount", rs.getInt("attempt_count"));
                    ((ObjectNode) task).put("manualRetryCount", rs.getInt("manual_retry_count"));
                    ((ObjectNode) task).put("stage", rs.getString("stage"));
                    ((ObjectNode) task).put("progress", rs.getInt("progress"));
                    ((ObjectNode) task).put("completedRooms", rs.getInt("completed_rooms"));
                    ((ObjectNode) task).put("totalRooms", rs.getInt("total_rooms"));
                    var progressMessage = rs.getString("progress_message");
                    if (progressMessage != null) ((ObjectNode) task).put("progressMessage", progressMessage);
                    var result = rs.getString("result_json");
                    if (result != null) ((ObjectNode) task).set("result", readJson(result));
                    var startedAt = rs.getTimestamp("started_at");
                    var completedAt = rs.getTimestamp("completed_at");
                    ((ObjectNode) task).put("createdAt", rs.getTimestamp("created_at").toInstant().toString());
                    if (startedAt != null) ((ObjectNode) task).put("startedAt", startedAt.toInstant().toString());
                    if (completedAt != null) ((ObjectNode) task).put("completedAt", completedAt.toInstant().toString());
                    return task;
                }, ownerId, projectId);
    }

    @Transactional
    public JsonNode createTask(UUID ownerId, UUID projectId, String taskType, JsonNode input) {
        requireProject(ownerId, projectId);
        if (!input.isObject()) throw invalid("Task input must be a JSON object");
        var taskId = UUID.randomUUID();
        var payload = ((ObjectNode) input.deepCopy());
        payload.put("id", taskId.toString());
        payload.put("projectId", projectId.toString());
        payload.put("taskType", taskType);
        var now = Timestamp.from(Instant.now());
        subscriptions.reserveGenerationUsage(ownerId, taskId, 1);
        jdbc.update("""
                insert into generation_tasks(owner_id, project_id, id, task_type, status, input_json,
                    attempt_count, created_at)
                values (?, ?, ?, ?, 'QUEUED', ?::jsonb, 0, ?)
                """, ownerId, projectId, taskId, taskType, json(payload), now);
        payload.put("status", "QUEUED");
        payload.put("createdAt", now.toInstant().toString());
        return payload;
    }

    public JsonNode getTask(UUID ownerId, UUID taskId) {
        var rows = jdbc.query("""
                select project_id from generation_tasks where owner_id = ? and id = ?
                """, (rs, row) -> rs.getObject("project_id", UUID.class), ownerId, taskId);
        if (rows.isEmpty()) throw notFound();
        return listTasks(ownerId, rows.getFirst()).stream()
                .filter(task -> task.path("id").asText().equals(taskId.toString()))
                .findFirst().orElseThrow(ProjectHistoryService::notFound);
    }

    private void requireProject(UUID ownerId, UUID projectId) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from workspace_project_aggregates where company_id = ? and project_id = ?)
                """, Boolean.class, ownerId, projectId))) throw notFound();
    }

    private List<JsonNode> readItems(JsonNode project, String field) {
        var values = project.get(field);
        if (values == null || values.isNull()) return List.of();
        if (!values.isArray()) throw invalid("Project " + field + " must be an array");
        return objectMapper.convertValue(values, objectMapper.getTypeFactory().constructCollectionType(List.class, JsonNode.class));
    }

    private TaskRow taskRow(UUID projectId, JsonNode task, Instant now) {
        var id = uuid(task, "id");
        var status = switch (task.path("status").asText("generating").toLowerCase()) {
            case "completed", "succeeded" -> "SUCCEEDED";
            case "failed" -> "FAILED";
            case "queued" -> "QUEUED";
            default -> "RUNNING";
        };
        var createdAt = instant(task, "startedAt", now);
        var startedAt = status.equals("QUEUED") ? null : createdAt;
        var completedAt = status.equals("SUCCEEDED") || status.equals("FAILED") ? instant(task, "completedAt", now) : null;
        var payload = ((ObjectNode) task.deepCopy());
        payload.put("projectId", projectId.toString());
        var mode = task.path("mode").asText();
        var type = mode.equals("recommendation") ? "RECOMMENDATION" : mode.equals("edit") ? "EDIT" : "RENDER";
        payload.put("taskType", type);
        return new TaskRow(id, type, status, json(payload), task.hasNonNull("result") ? json(task.get("result")) : null,
                task.hasNonNull("error") ? task.get("error").asText() : null,
                createdAt, startedAt, completedAt);
    }

    private VersionRow versionRow(UUID projectId, JsonNode version, int number, Instant now) {
        return new VersionRow(uuid(version, "id"), number, json(version), instant(version, "createdAt", now));
    }

    private UUID uuid(JsonNode value, String field) {
        try {
            return UUID.fromString(value.path(field).asText());
        } catch (IllegalArgumentException exception) {
            throw invalid("Project history item requires a UUID " + field);
        }
    }

    private Instant instant(JsonNode value, String field, Instant fallback) {
        try {
            return Instant.parse(value.path(field).asText());
        } catch (RuntimeException exception) {
            return fallback;
        }
    }

    private String json(JsonNode value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to serialize project history", exception);
        }
    }

    private JsonNode readJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Stored project history is invalid", exception);
        }
    }

    private static BusinessApiException invalid(String message) {
        return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
    }

    private static BusinessApiException notFound() {
        return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Project or task was not found");
    }

    private record TaskRow(UUID id, String type, String status, String payload, String result, String error,
                           Instant createdAt, Instant startedAt, Instant completedAt) { }
    private record VersionRow(UUID id, int number, String payload, Instant createdAt) { }
}

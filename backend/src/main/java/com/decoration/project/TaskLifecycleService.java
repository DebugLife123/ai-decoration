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
import java.util.UUID;

@Service
public class TaskLifecycleService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public TaskLifecycleService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public JsonNode claim(UUID taskId, String workerId, int leaseSeconds) {
        var now = Instant.now();
        var leaseUntil = now.plusSeconds(Math.max(30, Math.min(3600, leaseSeconds)));
        jdbc.update("""
                update generation_tasks set status = 'FAILED', completed_at = ?,
                    error_message = 'Task lease expired after maximum attempts',
                    lease_owner = null, lease_expires_at = null
                where id = ? and status = 'RUNNING' and lease_expires_at < ? and attempt_count >= max_attempts
                """, Timestamp.from(now), taskId, Timestamp.from(now));
        var changed = jdbc.update("""
                update generation_tasks set status = 'RUNNING', started_at = coalesce(started_at, ?),
                    attempt_count = attempt_count + 1, lease_owner = ?, lease_expires_at = ?
                where id = ? and attempt_count < max_attempts and (
                    (status = 'QUEUED' and available_at <= ?) or
                    (status = 'RUNNING' and lease_expires_at < ?))
                """, Timestamp.from(now), workerId, Timestamp.from(leaseUntil), taskId,
                Timestamp.from(now), Timestamp.from(now));
        if (changed == 0) throw conflict("Task is not available for claiming");
        return task(taskId, null);
    }

    @Transactional
    public JsonNode complete(UUID taskId, String workerId, JsonNode result, JsonNode snapshot) {
        if (result == null || result.isNull()) throw invalid("Task result is required");
        var current = taskRow(taskId);
        ensureRunning(current, workerId);
        var now = Instant.now();
        var versionId = UUID.randomUUID();
        var versionNumber = jdbc.queryForObject("""
                select coalesce(max(version_number), 0) + 1 from project_versions
                where owner_id = ? and project_id = ?
                """, Integer.class, current.ownerId(), current.projectId());
        var versionSnapshot = snapshot == null || snapshot.isNull() ? result : snapshot;
        var storedResult = result.deepCopy();
        if (storedResult instanceof ObjectNode object) object.put("versionId", versionId.toString());
        jdbc.update("""
                update generation_tasks set status = 'SUCCEEDED', result_json = ?::jsonb,
                    completed_at = ?, lease_owner = null, lease_expires_at = null, error_message = null
                where owner_id = ? and id = ? and status = 'RUNNING'
                """, json(storedResult), Timestamp.from(now), current.ownerId(), taskId);
        jdbc.update("""
                insert into project_versions(owner_id, project_id, id, task_id, version_number, snapshot_json, created_at)
                values (?, ?, ?, ?, ?, ?::jsonb, ?)
                """, current.ownerId(), current.projectId(), versionId, taskId, versionNumber,
                json(versionSnapshot), Timestamp.from(now));
        return task(taskId, current.ownerId());
    }

    @Transactional
    public JsonNode fail(UUID taskId, String workerId, String message, boolean retryable) {
        var current = taskRow(taskId);
        ensureRunning(current, workerId);
        var now = Instant.now();
        var canRetry = retryable && current.retryCount() + 1 < current.maxAttempts();
        if (canRetry) {
            jdbc.update("""
                    update generation_tasks set status = 'QUEUED', retry_count = retry_count + 1,
                        error_message = ?, available_at = ?, lease_owner = null, lease_expires_at = null
                    where owner_id = ? and id = ? and status = 'RUNNING'
                    """, cleanError(message), Timestamp.from(now.plusSeconds(5)), current.ownerId(), taskId);
        } else {
            jdbc.update("""
                    update generation_tasks set status = 'FAILED', retry_count = retry_count + ?,
                        error_message = ?, completed_at = ?, lease_owner = null, lease_expires_at = null
                    where owner_id = ? and id = ? and status = 'RUNNING'
                    """, canRetry ? 0 : 1, cleanError(message), Timestamp.from(now), current.ownerId(), taskId);
        }
        return task(taskId, current.ownerId());
    }

    @Transactional
    public JsonNode retry(UUID ownerId, UUID taskId) {
        var current = taskRow(ownerId, taskId);
        if (!"FAILED".equals(current.status())) throw conflict("Only failed tasks can be retried");
        if (current.manualRetryCount() >= 3) throw conflict("Manual retry limit has been reached");
        jdbc.update("""
                update generation_tasks set status = 'QUEUED', available_at = ?, completed_at = null,
                    attempt_count = 0, retry_count = 0, manual_retry_count = manual_retry_count + 1,
                    error_message = null, lease_owner = null, lease_expires_at = null
                where owner_id = ? and id = ? and status = 'FAILED'
                """, Timestamp.from(Instant.now()), current.ownerId(), taskId);
        return task(taskId, current.ownerId());
    }

    public JsonNode get(UUID ownerId, UUID taskId) { return task(taskId, ownerId); }

    @Transactional
    public JsonNode claimNext(String workerId, int leaseSeconds) {
        var now = Instant.now();
        jdbc.update("""
                update generation_tasks set status = 'FAILED', completed_at = ?,
                    error_message = 'Task lease expired after maximum attempts',
                    lease_owner = null, lease_expires_at = null
                where status = 'RUNNING' and lease_expires_at < ? and attempt_count >= max_attempts
                """, Timestamp.from(now), Timestamp.from(now));
        var leaseUntil = Timestamp.from(now.plusSeconds(Math.max(30, Math.min(3600, leaseSeconds))));
        var taskIds = jdbc.query("""
                with next_task as (
                    select id from generation_tasks
                    where attempt_count < max_attempts and (
                        (status = 'QUEUED' and available_at <= ?) or
                        (status = 'RUNNING' and lease_expires_at < ?))
                    order by available_at, created_at, id
                    for update skip locked
                    limit 1
                )
                update generation_tasks task set status = 'RUNNING', started_at = coalesce(task.started_at, ?),
                    attempt_count = task.attempt_count + 1, lease_owner = ?, lease_expires_at = ?
                from next_task where task.id = next_task.id
                returning task.id
                """, (rs, row) -> rs.getObject("id", UUID.class), Timestamp.from(now), Timestamp.from(now),
                Timestamp.from(now), workerId, leaseUntil);
        return taskIds.isEmpty() ? null : task(taskIds.getFirst(), null);
    }

    private JsonNode task(UUID taskId, UUID ownerId) {
        var sql = """
                select owner_id, project_id, input_json, result_json, status, error_message,
                    retry_count, max_attempts, created_at, started_at, completed_at, manual_retry_count
                from generation_tasks where id = ? and (?::uuid is null or owner_id = ?)
                """;
        var rows = jdbc.query(sql, (rs, row) -> {
                    var input = readJson(rs.getString("input_json"));
                    var output = input instanceof ObjectNode object ? object : objectMapper.createObjectNode();
                    output.put("status", rs.getString("status"));
                    output.put("projectId", rs.getObject("project_id", UUID.class).toString());
                    output.put("retryCount", rs.getInt("retry_count"));
                    output.put("maxAttempts", rs.getInt("max_attempts"));
                    output.put("manualRetryCount", rs.getInt("manual_retry_count"));
                    output.put("createdAt", rs.getTimestamp("created_at").toInstant().toString());
                    var error = rs.getString("error_message");
                    if (error != null) output.put("error", error);
                    var result = rs.getString("result_json");
                    if (result != null) output.set("result", readJson(result));
                    var started = rs.getTimestamp("started_at");
                    var completed = rs.getTimestamp("completed_at");
                    if (started != null) output.put("startedAt", started.toInstant().toString());
                    if (completed != null) output.put("completedAt", completed.toInstant().toString());
                    return new TaskRecord(rs.getObject("owner_id", UUID.class), rs.getObject("project_id", UUID.class),
                            output, rs.getString("status"), rs.getInt("retry_count"), rs.getInt("max_attempts"),
                            rs.getInt("manual_retry_count"), null, null);
                }, taskId, ownerId, ownerId);
        if (rows.isEmpty()) throw notFound();
        return rows.getFirst().output();
    }

    private TaskRecord taskRow(UUID taskId) { return taskRow(null, taskId); }

    private TaskRecord taskRow(UUID ownerId, UUID taskId) {
        var rows = jdbc.query("""
                select owner_id, project_id, status, retry_count, max_attempts, manual_retry_count,
                    lease_owner, lease_expires_at
                from generation_tasks where id = ? and (?::uuid is null or owner_id = ?) for update
                """, (rs, row) -> new TaskRecord(rs.getObject("owner_id", UUID.class),
                rs.getObject("project_id", UUID.class), null, rs.getString("status"),
                rs.getInt("retry_count"), rs.getInt("max_attempts"), rs.getInt("manual_retry_count"),
                rs.getString("lease_owner"), rs.getTimestamp("lease_expires_at") == null ? null : rs.getTimestamp("lease_expires_at").toInstant()),
                taskId, ownerId, ownerId);
        if (rows.isEmpty()) throw notFound();
        return rows.getFirst();
    }

    private void ensureRunning(TaskRecord task, String workerId) {
        if (!"RUNNING".equals(task.status())) throw conflict("Task is not running");
        if (task.leaseOwner() == null || !task.leaseOwner().equals(workerId)
                || task.leaseExpiresAt() == null || task.leaseExpiresAt().isBefore(Instant.now())) {
            throw conflict("Task lease is not owned by this worker");
        }
    }

    private JsonNode readJson(String value) {
        try { return objectMapper.readTree(value); }
        catch (Exception exception) { throw new IllegalStateException("Stored task JSON is invalid", exception); }
    }

    private String json(JsonNode value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (Exception exception) { throw new IllegalStateException("Unable to serialize task JSON", exception); }
    }

    private static String cleanError(String value) {
        var text = value == null || value.isBlank() ? "Task failed" : value.trim();
        return text.length() > 1000 ? text.substring(0, 1000) : text;
    }

    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }
    private static BusinessApiException conflict(String message) { return new BusinessApiException(HttpStatus.CONFLICT, "TASK_CONFLICT", message); }
    private static BusinessApiException notFound() { return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Task was not found"); }

    private record TaskRecord(UUID ownerId, UUID projectId, JsonNode output, String status, int retryCount,
                              int maxAttempts, int manualRetryCount, String leaseOwner, Instant leaseExpiresAt) { }
}

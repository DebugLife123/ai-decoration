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

    private final com.decoration.saas.SaasSubscriptionService subscriptions;
    public TaskLifecycleService(JdbcTemplate jdbc, ObjectMapper objectMapper, com.decoration.saas.SaasSubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
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
        var versionId = versionId(snapshot, result);
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
        subscriptions.reserveGenerationUsage(ownerId, taskId, 1);
        jdbc.update("""
                update generation_tasks set status = 'QUEUED', available_at = ?, completed_at = null,
                    attempt_count = 0, retry_count = 0, manual_retry_count = manual_retry_count + 1,
                    error_message = null, lease_owner = null, lease_expires_at = null
                where owner_id = ? and id = ? and status = 'FAILED'
                """, Timestamp.from(Instant.now()), current.ownerId(), taskId);
        return task(taskId, current.ownerId());
    }

    /**
     * Browser-owned lifecycle for the synchronous AI gateway flow. Worker endpoints keep
     * their lease contract; these methods are strictly scoped to the authenticated owner.
     */
    @Transactional
    public JsonNode startForOwner(UUID ownerId, UUID taskId) {
        var current = taskRow(ownerId, taskId);
        if (!"QUEUED".equals(current.status()) && !"RUNNING".equals(current.status())) {
            throw conflict("Only queued or running tasks can be started");
        }
        var now = Instant.now();
        jdbc.update("""
                update generation_tasks set status = 'RUNNING', started_at = coalesce(started_at, ?),
                    stage = case when stage = 'queued' then 'recognizing' else stage end,
                    progress = greatest(progress, 1), progress_message = ?, completed_at = null,
                    error_message = null, available_at = ?
                where owner_id = ? and id = ? and status in ('QUEUED', 'RUNNING')
                """, Timestamp.from(now), "正在准备 AI 分析…", Timestamp.from(now), ownerId, taskId);
        return task(taskId, ownerId);
    }

    @Transactional
    public JsonNode updateProgress(UUID ownerId, UUID taskId, String stage, int progress,
                                   String message, int completedRooms, int totalRooms, JsonNode partialResult) {
        if (progress < 0 || progress > 100) throw invalid("Task progress must be between 0 and 100");
        if (completedRooms < 0 || totalRooms < 0 || completedRooms > totalRooms) {
            throw invalid("Task room progress is invalid");
        }
        var current = taskRow(ownerId, taskId);
        if (!"QUEUED".equals(current.status()) && !"RUNNING".equals(current.status())) {
            throw conflict("Only queued or running tasks can receive progress updates");
        }
        var now = Instant.now();
        jdbc.update("""
                update generation_tasks set status = 'RUNNING', started_at = coalesce(started_at, ?),
                    stage = ?, progress = ?, progress_message = ?, completed_rooms = ?, total_rooms = ?,
                    result_json = coalesce(?::jsonb, result_json), completed_at = null
                where owner_id = ? and id = ? and status in ('QUEUED', 'RUNNING')
                """, Timestamp.from(now), cleanStage(stage), progress, cleanMessage(message), completedRooms,
                totalRooms, partialResult == null || partialResult.isNull() ? null : json(partialResult), ownerId, taskId);
        return task(taskId, ownerId);
    }

    @Transactional
    public JsonNode completeForOwner(UUID ownerId, UUID taskId, JsonNode result, JsonNode snapshot) {
        if (result == null || result.isNull()) throw invalid("Task result is required");
        var current = taskRow(ownerId, taskId);
        if (!"QUEUED".equals(current.status()) && !"RUNNING".equals(current.status())) {
            throw conflict("Only queued or running tasks can be completed");
        }
        return finishOwnerTask(current, result, snapshot, "SUCCEEDED", null);
    }

    @Transactional
    public JsonNode failForOwner(UUID ownerId, UUID taskId, String message, boolean retryable,
                                 JsonNode partialResult, JsonNode snapshot) {
        var current = taskRow(ownerId, taskId);
        if (!"QUEUED".equals(current.status()) && !"RUNNING".equals(current.status())) {
            throw conflict("Only queued or running tasks can fail");
        }
        var now = Instant.now();
        var canRetry = retryable && current.retryCount() < current.maxAttempts();
        if (canRetry) {
            jdbc.update("""
                    update generation_tasks set status = 'QUEUED', retry_count = retry_count + 1,
                        stage = 'retrying', progress_message = ?, error_message = ?, available_at = ?,
                        lease_owner = null, lease_expires_at = null, completed_at = null,
                        result_json = coalesce(?::jsonb, result_json)
                    where owner_id = ? and id = ? and status in ('QUEUED', 'RUNNING')
                    """, "本次请求失败，已保留可重试任务", cleanError(message), Timestamp.from(now.plusSeconds(5)),
                    partialResult == null || partialResult.isNull() ? null : json(partialResult), ownerId, taskId);
            return task(taskId, ownerId);
        }
        if (partialResult != null && !partialResult.isNull()) {
            return finishOwnerTask(current, partialResult, snapshot, "FAILED", cleanError(message));
        }
        jdbc.update("""
                update generation_tasks set status = 'FAILED', stage = 'failed', progress_message = ?,
                    error_message = ?, completed_at = ?, lease_owner = null, lease_expires_at = null
                where owner_id = ? and id = ? and status in ('QUEUED', 'RUNNING')
                """, "生成失败", cleanError(message), Timestamp.from(now), ownerId, taskId);
        return task(taskId, ownerId);
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
                    retry_count, max_attempts, created_at, started_at, completed_at, manual_retry_count,
                    stage, progress, progress_message, completed_rooms, total_rooms
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
                    output.put("stage", rs.getString("stage"));
                    output.put("progress", rs.getInt("progress"));
                    output.put("completedRooms", rs.getInt("completed_rooms"));
                    output.put("totalRooms", rs.getInt("total_rooms"));
                    var progressMessage = rs.getString("progress_message");
                    if (progressMessage != null) output.put("progressMessage", progressMessage);
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
                            taskId, output, rs.getString("status"), rs.getInt("retry_count"), rs.getInt("max_attempts"),
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
                rs.getObject("project_id", UUID.class), taskId, null, rs.getString("status"),
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

    private JsonNode finishOwnerTask(TaskRecord current, JsonNode result, JsonNode snapshot,
                                     String status, String error) {
        var now = Instant.now();
        var versionId = versionId(snapshot, result);
        var versionNumber = jdbc.queryForObject("""
                select coalesce(max(version_number), 0) + 1 from project_versions
                where owner_id = ? and project_id = ?
                """, Integer.class, current.ownerId(), current.projectId());
        var storedResult = result.deepCopy();
        if (storedResult instanceof ObjectNode object) object.put("versionId", versionId.toString());
        var versionSnapshot = snapshot == null || snapshot.isNull() ? storedResult : snapshot.deepCopy();
        if (versionSnapshot instanceof ObjectNode object) object.put("id", versionId.toString());
        var completed = "SUCCEEDED".equals(status);
        jdbc.update("""
                update generation_tasks set status = ?, result_json = ?::jsonb, stage = ?, progress = ?,
                    progress_message = ?, error_message = ?, completed_at = ?, lease_owner = null, lease_expires_at = null
                where owner_id = ? and id = ? and status in ('QUEUED', 'RUNNING')
                """, status, json(storedResult), completed ? "completed" : "partial", completed ? 100 : 99,
                completed ? "方案已完成" : "已保留部分生成结果，可重试失败空间", error, Timestamp.from(now),
                current.ownerId(), current.taskId());
        jdbc.update("""
                insert into project_versions(owner_id, project_id, id, task_id, version_number, snapshot_json, created_at)
                values (?, ?, ?, ?, ?, ?::jsonb, ?)
                on conflict (owner_id, id) do update set task_id = excluded.task_id,
                    snapshot_json = excluded.snapshot_json
                """, current.ownerId(), current.projectId(), versionId, current.taskId(), versionNumber,
                json(versionSnapshot), Timestamp.from(now));
        return task(current.taskId(), current.ownerId());
    }

    private static String cleanStage(String value) {
        var text = value == null || value.isBlank() ? "generating" : value.trim().toLowerCase();
        return text.length() > 48 ? text.substring(0, 48) : text;
    }

    private static UUID versionId(JsonNode snapshot, JsonNode result) {
        var value = snapshot == null ? null : snapshot.path("id").asText(null);
        if (value == null || value.isBlank()) value = result.path("versionId").asText(null);
        try { return value == null || value.isBlank() ? UUID.randomUUID() : UUID.fromString(value); }
        catch (IllegalArgumentException exception) { throw invalid("Version id must be a UUID"); }
    }

    private static String cleanMessage(String value) {
        if (value == null || value.isBlank()) return null;
        var text = value.trim();
        return text.length() > 500 ? text.substring(0, 500) : text;
    }

    private static BusinessApiException invalid(String message) { return new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message); }
    private static BusinessApiException conflict(String message) { return new BusinessApiException(HttpStatus.CONFLICT, "TASK_CONFLICT", message); }
    private static BusinessApiException notFound() { return new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Task was not found"); }

    private record TaskRecord(UUID ownerId, UUID projectId, UUID taskId, JsonNode output, String status, int retryCount,
                              int maxAttempts, int manualRetryCount, String leaseOwner, Instant leaseExpiresAt) { }
}

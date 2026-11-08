package com.decoration.project;

import com.decoration.shared.api.BusinessApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class ProjectDataService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final ProjectHistoryService historyService;

    public ProjectDataService(JdbcTemplate jdbc, ObjectMapper objectMapper, ProjectHistoryService historyService) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.historyService = historyService;
    }

    public List<JsonNode> list(UUID companyId) {
        return jdbc.query("select project_json from workspace_project_aggregates where company_id = ? order by updated_at desc, project_id",
                (rs, rowNum) -> readJson(rs), companyId);
    }

    @Transactional
    public List<JsonNode> replace(UUID companyId, List<JsonNode> projects) {
        var incomingIds = projects.stream().map(this::projectId).toList();
        if (incomingIds.stream().distinct().count() != incomingIds.size()) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Project IDs must be unique");
        }
        for (var project : projects) save(companyId, projectId(project), project);
        if (incomingIds.isEmpty()) {
            jdbc.update("delete from workspace_project_aggregates where company_id = ?", companyId);
        } else {
            var placeholders = String.join(",", incomingIds.stream().map(id -> "?").toList());
            var args = new Object[incomingIds.size() + 1];
            args[0] = companyId;
            for (int i = 0; i < incomingIds.size(); i++) args[i + 1] = incomingIds.get(i);
            jdbc.update("delete from workspace_project_aggregates where company_id = ? and project_id not in (" + placeholders + ")", args);
        }
        return list(companyId);
    }

    @Transactional
    public JsonNode save(UUID companyId, UUID projectId, JsonNode project) {
        if (!project.isObject() || !projectId.equals(projectId(project))) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Project ID is required and must match the path");
        }
        var timestamp = OffsetDateTime.now(ZoneOffset.UTC);
        jdbc.update("""
                insert into workspace_project_aggregates(company_id, project_id, project_json, created_at, updated_at)
                values (?, ?, ?::jsonb, ?, ?)
                on conflict (company_id, project_id) do update set project_json = excluded.project_json, updated_at = excluded.updated_at
                """, companyId, projectId, project.toString(), timestamp, timestamp);
        historyService.synchronize(companyId, projectId, project);
        return project;
    }

    public void delete(UUID companyId, UUID projectId) {
        jdbc.update("delete from workspace_project_aggregates where company_id = ? and project_id = ?", companyId, projectId);
    }

    private UUID projectId(JsonNode project) {
        var id = project.get("id");
        if (id == null || !id.isTextual()) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Project id is required");
        }
        try {
            return UUID.fromString(id.textValue());
        } catch (IllegalArgumentException exception) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Project id must be a UUID");
        }
    }

    private JsonNode readJson(ResultSet resultSet) throws SQLException {
        try {
            return objectMapper.readTree(resultSet.getString("project_json"));
        } catch (Exception exception) {
            throw new SQLException("Stored project JSON is invalid", exception);
        }
    }
}

package com.decoration.budget;

import com.decoration.business.IdempotencyStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static com.decoration.budget.BudgetDtos.EstimateRequest;
import static com.decoration.budget.BudgetDtos.EstimateResult;
import static com.decoration.budget.BudgetDtos.SavedBudget;

/** 保存与查询试算结果。快照落库后不再随报价变动，否则历史预算会「漂移」。 */
@Service
public class BudgetArchiveService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final IdempotencyStore idempotency;

    public BudgetArchiveService(JdbcTemplate jdbc, ObjectMapper objectMapper, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.idempotency = idempotency;
    }

    @Transactional
    public SavedBudget save(UUID ownerId, String key, EstimateRequest request, EstimateResult result) {
        var id = idempotency.reserve(ownerId, key, "budget", request, UUID.randomUUID());
        var existing = findByOwner(ownerId, id);
        if (existing != null) return existing;
        var now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into project_budget_estimates(id, owner_id, project_id, pricing_mode, model_version,
                    input_json, result_json, total_low, total_high, data_quality, created_at)
                values (?, ?, ?, ?, ?, cast(? as jsonb), cast(? as jsonb), ?, ?, ?, ?)
                """, id, ownerId, request.projectId(), result.pricingMode(), result.modelVersion(),
                writeJson(request), writeJson(result), result.totalLow(), result.totalHigh(),
                result.dataQuality(), now);
        return toSaved(id, request.projectId(), result, now.toInstant());
    }

    private SavedBudget findByOwner(UUID ownerId, UUID id) {
        var rows = jdbc.query("""
                select id, project_id, pricing_mode, model_version, total_low, total_high,
                       data_quality, result_json, created_at
                from project_budget_estimates where owner_id = ? and id = ?
                """, (rs, n) -> {
            var result = readResult(rs.getString("result_json"));
            return new SavedBudget(rs.getObject("id", UUID.class), rs.getObject("project_id", UUID.class),
                    rs.getString("pricing_mode"), rs.getString("model_version"),
                    rs.getBigDecimal("total_low"), rs.getBigDecimal("total_high"),
                    rs.getString("data_quality"), result, rs.getTimestamp("created_at").toInstant());
        }, ownerId, id);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public List<SavedBudget> list(UUID ownerId, UUID projectId) {
        var sql = new StringBuilder("""
                select id, project_id, pricing_mode, model_version, total_low, total_high,
                       data_quality, result_json, created_at
                from project_budget_estimates where owner_id = ?
                """);
        var args = new ArrayList<Object>();
        args.add(ownerId);
        if (projectId != null) {
            sql.append(" and project_id = ?");
            args.add(projectId);
        }
        sql.append(" order by created_at desc limit 50");
        return jdbc.query(sql.toString(), (rs, n) -> {
            var result = readResult(rs.getString("result_json"));
            return new SavedBudget(rs.getObject("id", UUID.class), rs.getObject("project_id", UUID.class),
                    rs.getString("pricing_mode"), rs.getString("model_version"),
                    rs.getBigDecimal("total_low"), rs.getBigDecimal("total_high"),
                    rs.getString("data_quality"), result,
                    rs.getTimestamp("created_at").toInstant());
        }, args.toArray());
    }

    @Transactional
    public boolean delete(UUID ownerId, UUID id) {
        var changed = jdbc.update("delete from project_budget_estimates where owner_id = ? and id = ?",
                ownerId, id);
        return changed > 0;
    }

    private SavedBudget toSaved(UUID id, UUID projectId, EstimateResult result, Instant createdAt) {
        return new SavedBudget(id, projectId, result.pricingMode(), result.modelVersion(),
                result.totalLow(), result.totalHigh(), result.dataQuality(), result, createdAt);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to serialize budget payload", exception);
        }
    }

    private EstimateResult readResult(String json) {
        try {
            return objectMapper.readValue(json, EstimateResult.class);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to read stored budget payload", exception);
        }
    }
}

package com.decoration.budget;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.decoration.budget.BudgetDtos.BudgetCoefficient;

@Service
public class BudgetCoefficientService {
    private final JdbcTemplate jdbc;

    public BudgetCoefficientService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<BudgetCoefficient> list() {
        return jdbc.query("""
                select coefficient_group, coefficient_code, label, factor, updated_at, updated_by
                from budget_estimate_coefficients
                order by case coefficient_group when 'REGION' then 1 when 'MATERIAL_GRADE' then 2 else 3 end,
                    coefficient_code
                """, (rs, row) -> new BudgetCoefficient(rs.getString("coefficient_group"),
                rs.getString("coefficient_code"), rs.getString("label"), rs.getBigDecimal("factor"),
                rs.getTimestamp("updated_at").toInstant(), rs.getObject("updated_by", UUID.class)));
    }

    public BigDecimal factor(String group, String code, BigDecimal fallback) {
        return jdbc.query("select factor from budget_estimate_coefficients where coefficient_group = ? and coefficient_code = ?",
                rs -> rs.next() ? rs.getBigDecimal(1) : fallback, group, code);
    }

    @Transactional
    public BudgetCoefficient update(String group, String code, BigDecimal factor, UUID adminId) {
        if (factor == null || factor.compareTo(new BigDecimal("0.500")) < 0
                || factor.compareTo(new BigDecimal("2.000")) > 0) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_FACTOR", "系数必须在 0.5 至 2.0 之间");
        }
        var changed = jdbc.update("""
                update budget_estimate_coefficients set factor = ?, updated_at = ?, updated_by = ?
                where coefficient_group = ? and coefficient_code = ?
                """, factor, Timestamp.from(Instant.now()), adminId, group, code);
        if (changed != 1) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "预算系数配置不存在");
        if ("STYLE".equals(group)) {
            jdbc.update("update budget_style_references set material_factor = ? where style_code = ?", factor, code);
        }
        return list().stream().filter(item -> item.coefficientGroup().equals(group)
                && item.coefficientCode().equals(code)).findFirst().orElseThrow();
    }
}

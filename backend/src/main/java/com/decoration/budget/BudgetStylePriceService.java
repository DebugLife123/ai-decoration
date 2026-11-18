package com.decoration.budget;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static com.decoration.budget.BudgetDtos.BudgetStylePriceRange;

@Service
public class BudgetStylePriceService {
    private final JdbcTemplate jdbc;

    public BudgetStylePriceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<BudgetStylePriceRange> list() {
        return jdbc.query("""
                select s.style_code, s.style_name, s.price_low_per_sqm, s.price_high_per_sqm, c.factor
                from budget_style_references s
                join budget_estimate_coefficients c on c.coefficient_group = 'STYLE' and c.coefficient_code = s.style_code
                order by s.style_code
                """, (rs, row) -> new BudgetStylePriceRange(
                rs.getString("style_code"), rs.getString("style_name"),
                rs.getBigDecimal("price_low_per_sqm"), rs.getBigDecimal("price_high_per_sqm"), rs.getBigDecimal("factor")));
    }

    @Transactional
    public BudgetStylePriceRange update(String code, BigDecimal low, BigDecimal high, BigDecimal materialFactor, UUID adminId) {
        if (low == null || high == null || low.signum() <= 0 || high.compareTo(low) < 0) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_PRICE_RANGE", "最高单价必须大于或等于最低单价");
        }
        var exists = Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from budget_style_references where style_code = ?)", Boolean.class, code));
        if (!exists) {
            var styleName = jdbc.query("select style_name from design_style_prompts where style_key = ?", rs ->
                    rs.next() ? rs.getString("style_name") : null, code);
            if (styleName == null) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "风格价格配置不存在");
            var factor = materialFactor == null ? BigDecimal.ONE : materialFactor;
            jdbc.update("""
                    insert into budget_style_references(style_code, style_name, material_factor, estimate_note,
                        price_low_per_sqm, price_high_per_sqm)
                    values (?, ?, ?, '管理员配置的硬装全包预算参考区间；非企业报价。', ?, ?)
                    """, code, styleName, factor, low, high);
            jdbc.update("""
                    insert into budget_estimate_coefficients(coefficient_group, coefficient_code, label, factor, updated_at, updated_by)
                    values ('STYLE', ?, ?, ?, now(), ?)
                    """, code, styleName, factor, adminId);
        } else {
            jdbc.update("""
                    update budget_style_references
                    set price_low_per_sqm = ?, price_high_per_sqm = ?
                    where style_code = ?
                    """, low, high, code);
        }
        if (materialFactor != null) {
            jdbc.update("""
                    update budget_estimate_coefficients set factor = ?, updated_at = ?, updated_by = ?
                    where coefficient_group = 'STYLE' and coefficient_code = ?
                    """, materialFactor, java.sql.Timestamp.from(java.time.Instant.now()), adminId, code);
            jdbc.update("update budget_style_references set material_factor = ? where style_code = ?", materialFactor, code);
        }
        return list().stream().filter(item -> item.styleCode().equals(code)).findFirst().orElseThrow();
    }
}

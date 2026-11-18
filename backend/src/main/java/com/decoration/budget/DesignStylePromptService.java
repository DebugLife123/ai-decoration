package com.decoration.budget;

import com.decoration.shared.api.BusinessApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;

@Service
public class DesignStylePromptService {
    private final JdbcTemplate jdbc;

    public DesignStylePromptService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<StylePrompt> list() {
        return jdbc.query("""
                select style_key, style_name, prompt, updated_at, updated_by
                from design_style_prompts order by style_name
                """, (rs, row) -> new StylePrompt(rs.getString("style_key"), rs.getString("style_name"),
                rs.getString("prompt"), rs.getTimestamp("updated_at").toInstant(), rs.getObject("updated_by", UUID.class)));
    }

    public List<StyleCatalogItem> catalog() {
        return jdbc.query("""
                select p.style_key, p.style_name, p.prompt, b.price_low_per_sqm, b.price_high_per_sqm,
                    coalesce(c.factor, b.material_factor, 1.000) as material_factor
                from design_style_prompts p
                left join budget_style_references b on b.style_code = case p.style_key
                    when 'modern' then 'modern-minimal'
                    when 'minimal' then 'wood-cream'
                    when 'smallAmerican' then 'small-american'
                    when 'cream' then 'french-natural'
                    when 'european' then 'old-money'
                    else p.style_key end
                left join budget_estimate_coefficients c on c.coefficient_group = 'STYLE' and c.coefficient_code = case p.style_key
                    when 'modern' then 'modern-minimal'
                    when 'minimal' then 'wood-cream'
                    when 'smallAmerican' then 'small-american'
                    when 'cream' then 'french-natural'
                    when 'european' then 'old-money'
                    else p.style_key end
                order by p.style_name
                """, (rs, row) -> new StyleCatalogItem(rs.getString("style_key"), rs.getString("style_name"),
                rs.getString("prompt"), rs.getBigDecimal("price_low_per_sqm"), rs.getBigDecimal("price_high_per_sqm"),
                rs.getBigDecimal("material_factor")));
    }

    @org.springframework.transaction.annotation.Transactional
    public StyleCatalogItem create(String key, String name, String prompt, BigDecimal low, BigDecimal high,
                                   BigDecimal factor, UUID adminId) {
        if (key == null || !key.matches("[a-z][a-z0-9-]{1,39}")) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_STYLE_KEY", "风格代码需为小写字母开头，可包含小写字母、数字和短横线");
        }
        if (name == null || name.isBlank() || name.length() > 80) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_STYLE_NAME", "风格名称不能为空且不能超过 80 个字符");
        }
        if (prompt == null || prompt.isBlank() || prompt.length() > 12000) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_PROMPT", "提示词不能为空且不能超过 12000 个字符");
        }
        if (low == null || high == null || low.compareTo(new BigDecimal("100")) < 0
                || high.compareTo(new BigDecimal("100")) < 0 || high.compareTo(low) < 0
                || high.compareTo(new BigDecimal("10000")) > 0) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_PRICE_RANGE", "预算单价需在 100–10000 元/㎡之间，最高价不能低于最低价");
        }
        if (factor == null || factor.compareTo(new BigDecimal("0.5")) < 0 || factor.compareTo(new BigDecimal("2.0")) > 0) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_FACTOR", "材料系数需在 0.5 至 2.0 之间");
        }
        try {
            jdbc.update("insert into design_style_prompts(style_key, style_name, prompt, updated_at, updated_by) values (?, ?, ?, now(), ?)", key, name.trim(), prompt.trim(), adminId);
        } catch (org.springframework.dao.DuplicateKeyException exception) {
            throw new BusinessApiException(HttpStatus.CONFLICT, "STYLE_EXISTS", "风格代码已存在");
        }
        jdbc.update("""
                insert into budget_style_references(style_code, style_name, material_factor, estimate_note, price_low_per_sqm, price_high_per_sqm)
                values (?, ?, ?, '平台配置的硬装全包预算参考区间；非企业报价。', ?, ?)
                """, key, name.trim(), factor, low, high);
        jdbc.update("""
                insert into budget_estimate_coefficients(coefficient_group, coefficient_code, label, factor, updated_at, updated_by)
                values ('STYLE', ?, ?, ?, now(), ?)
                """, key, name.trim(), factor, adminId);
        return catalog().stream().filter(item -> item.styleKey().equals(key)).findFirst().orElseThrow();
    }

    public StylePrompt update(String key, String prompt, UUID adminId) {
        if (prompt == null || prompt.isBlank() || prompt.length() > 12000) {
            throw new BusinessApiException(HttpStatus.BAD_REQUEST, "INVALID_PROMPT", "提示词不能为空且不能超过 12000 个字符");
        }
        var changed = jdbc.update("""
                update design_style_prompts set prompt = ?, updated_at = ?, updated_by = ?
                where style_key = ?
                """, prompt.trim(), Timestamp.from(Instant.now()), adminId, key);
        if (changed != 1) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "风格提示词不存在");
        return list().stream().filter(item -> item.styleKey().equals(key)).findFirst().orElseThrow();
    }

    @org.springframework.transaction.annotation.Transactional
    public void delete(String key) {
        var styleName = jdbc.query("select style_name from design_style_prompts where style_key = ?", rs ->
                rs.next() ? rs.getString("style_name") : null, key);
        if (styleName == null) throw new BusinessApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "风格不存在或已删除");
        var budgetCode = switch (key) {
            case "modern" -> "modern-minimal";
            case "minimal" -> "wood-cream";
            case "smallAmerican" -> "small-american";
            case "cream" -> "french-natural";
            case "european" -> "old-money";
            default -> key;
        };
        jdbc.update("""
                update company_style_profiles
                set profiles = coalesce((
                    select jsonb_agg(item.profile)
                    from jsonb_array_elements(profiles) as item(profile)
                    where item.profile ->> 'style' <> ?
                ), '[]'::jsonb), version = version + 1, updated_at = now()
                where profiles @> jsonb_build_array(jsonb_build_object('style', ?))
                """, key, key);
        jdbc.update("delete from budget_style_references where style_code = ?", budgetCode);
        jdbc.update("delete from budget_estimate_coefficients where coefficient_group = 'STYLE' and coefficient_code = ?", budgetCode);
        jdbc.update("delete from design_style_prompts where style_key = ?", key);
    }

    public record StylePrompt(String styleKey, String styleName, String prompt, Instant updatedAt, UUID updatedBy) { }
    public record StyleCatalogItem(String styleKey, String styleName, String prompt, BigDecimal priceLowPerSqm,
                                   BigDecimal priceHighPerSqm, BigDecimal materialFactor) { }
}

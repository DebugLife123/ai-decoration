package com.decoration.project;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;

/**
 * Browser-driven runs report progress every couple of seconds. When the reports stop
 * (tab closed, laptop asleep, gateway killed) the row would stay RUNNING forever and
 * the project list would show a phantom "generating". Close it after a quiet period so
 * the UI can offer a retry instead.
 */
@Component
public class StaleGenerationTaskRecovery {
    private static final Logger log = LoggerFactory.getLogger(StaleGenerationTaskRecovery.class);
    private static final String STALE_MESSAGE = "生成进度长时间没有更新，任务已中断；可从项目记录中重新尝试。";
    private static final long STALE_AFTER_SECONDS = 10 * 60L;

    private final JdbcTemplate jdbc;

    public StaleGenerationTaskRecovery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(fixedDelay = 60_000L, initialDelay = 60_000L)
    public void closeAbandonedTasks() {
        var now = Instant.now();
        var updated = jdbc.update("""
                update generation_tasks set status = 'FAILED', stage = 'interrupted',
                    error_message = ?, completed_at = ?, heartbeat_at = ?
                where status = 'RUNNING' and heartbeat_at < ?
                """, STALE_MESSAGE, Timestamp.from(now), Timestamp.from(now),
                Timestamp.from(now.minusSeconds(STALE_AFTER_SECONDS)));
        if (updated > 0) {
            log.info("Closed {} abandoned generation task(s) that stopped reporting progress.", updated);
        }
    }
}

package com.learnmate.learnmateai.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Indexes that keep the hybrid search fast as schools upload more books.
 * Hibernate's ddl-auto can't create the full-text (expression) index, so they
 * are created here at startup; IF NOT EXISTS makes this a no-op after the first run.
 *
 * No vector (HNSW) index on purpose: every search is limited to one school's
 * class, a few thousand pieces at most, where an exact scan is quick and,
 * unlike an approximate index, never misses a match.
 */
@Component
public class SearchIndexes implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SearchIndexes.class);

    private static final String[] STATEMENTS = {
            "CREATE INDEX IF NOT EXISTS idx_document_chunks_scope ON document_chunks (institution, standard)",
            "CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON document_chunks "
                    + "USING gin (to_tsvector('english', content))",
    };

    private final JdbcTemplate jdbc;

    public SearchIndexes(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (String sql : STATEMENTS) {
            try {
                jdbc.execute(sql);
            } catch (RuntimeException e) {
                // Search still works without them, just slower.
                log.warn("Could not create search index ({}): {}", sql, e.getMessage());
            }
        }
    }
}

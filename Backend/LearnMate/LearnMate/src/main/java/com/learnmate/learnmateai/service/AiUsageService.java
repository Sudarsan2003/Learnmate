package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.llm.LlmUsageRecorder;
import com.learnmate.learnmateai.model.School;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.SchoolRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Keeps AI spending under control:
 *  - each student may ask a limited number of questions per day (India time),
 *    set per school or by learnmate.ai.daily-limit.student;
 *  - every model call's tokens are added to the caller's row in ai_usage, from
 *    which {@link #report} estimates the cost per school.
 */
@Service
public class AiUsageService implements LlmUsageRecorder {

    private static final Logger log = LoggerFactory.getLogger(AiUsageService.class);

    public static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    /** Model calls made with nobody signed in (none today; kept so tokens are never lost). */
    static final String BACKGROUND = "(background)";

    private static final String UPSERT = """
            INSERT INTO ai_usage (username, institution, day, requests, input_tokens, output_tokens, images)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (username, day) DO UPDATE SET
                requests = ai_usage.requests + EXCLUDED.requests,
                input_tokens = ai_usage.input_tokens + EXCLUDED.input_tokens,
                output_tokens = ai_usage.output_tokens + EXCLUDED.output_tokens,
                images = ai_usage.images + EXCLUDED.images,
                institution = coalesce(EXCLUDED.institution, ai_usage.institution)
            RETURNING requests
            """;

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final SchoolRepository schools;

    // Questions per student per day when the school has no limit of its own; 0 = no limit.
    @Value("${learnmate.ai.daily-limit.student:60}")
    private int studentDailyLimit;

    // Teachers and admins; 0 = no limit.
    @Value("${learnmate.ai.daily-limit.staff:0}")
    private int staffDailyLimit;

    // The model the tutor runs on; its list price is used unless overridden below.
    @Value("${learnmate.llm.anthropic.model:claude-sonnet-4-6}")
    private String model;

    // US dollars per million tokens. Empty = the list price of `model` (MODEL_PRICES).
    @Value("${learnmate.ai.price.input-per-mtok:}")
    private String inputPriceOverride;

    @Value("${learnmate.ai.price.output-per-mtok:}")
    private String outputPriceOverride;

    // US$ per story picture (FLUX.1 schnell on Replicate is about $0.003).
    @Value("${learnmate.ai.price.image-usd:0.003}")
    private double imagePriceUsd;

    @Value("${learnmate.ai.price.usd-to-inr:88}")
    private double usdToInr;

    /** Anthropic list prices, US$ per million tokens {input, output} (November 2026). */
    static final Map<String, double[]> MODEL_PRICES = Map.ofEntries(
            Map.entry("claude-sonnet-5-5", new double[]{2.0, 10.0}),
            Map.entry("claude-sonnet-5", new double[]{2.0, 10.0}),
            Map.entry("claude-sonnet-4-6", new double[]{3.0, 15.0}),
            Map.entry("claude-opus-5-5", new double[]{4.0, 20.0}),
            Map.entry("claude-opus-5", new double[]{5.0, 25.0}),
            Map.entry("claude-opus-4-8", new double[]{5.0, 25.0}),
            Map.entry("claude-opus-4-7", new double[]{5.0, 25.0}),
            Map.entry("claude-opus-4-6", new double[]{5.0, 25.0}),
            Map.entry("claude-haiku-5-5", new double[]{0.10, 0.50}),
            Map.entry("claude-haiku-4-5", new double[]{1.0, 5.0}));

    /** {input, output} US$ per million tokens: the override if set, else the model's list price, else Sonnet 4.6's. */
    static double[] prices(String model, String inputOverride, String outputOverride) {
        double[] list = MODEL_PRICES.getOrDefault(model == null ? "" : model.trim(), new double[]{3.0, 15.0});
        return new double[]{
                inputOverride == null || inputOverride.isBlank() ? list[0] : Double.parseDouble(inputOverride.trim()),
                outputOverride == null || outputOverride.isBlank() ? list[1] : Double.parseDouble(outputOverride.trim())};
    }

    private double inputPricePerMTok;
    private double outputPricePerMTok;

    @jakarta.annotation.PostConstruct
    void resolvePrices() {
        double[] p = prices(model, inputPriceOverride, outputPriceOverride);
        inputPricePerMTok = p[0];
        outputPricePerMTok = p[1];
    }

    public AiUsageService(JdbcTemplate jdbc, UserRepository users, SchoolRepository schools) {
        this.jdbc = jdbc;
        this.users = users;
        this.schools = schools;
    }

    /** Thrown when a student has used up today's questions; answered with 429. */
    public static class DailyLimitException extends RuntimeException {
        private final int limit;

        public DailyLimitException(int limit) {
            super("You've asked " + limit + " questions today, which is your school's daily limit. "
                    + "You can ask again after midnight. Meanwhile, try a quiz or a game!");
            this.limit = limit;
        }

        public int getLimit() {
            return limit;
        }
    }

    public static LocalDate today() {
        return LocalDate.now(INDIA);
    }

    /**
     * The daily question limit for {@code role}: a student gets the school's own
     * limit if it has one, else the default; staff get the staff limit. 0 = none.
     */
    static int limitFor(String role, Integer schoolLimit, int studentDefault, int staffLimit) {
        if (!"USER".equals(role)) return Math.max(0, staffLimit);
        return Math.max(0, schoolLimit != null ? schoolLimit : studentDefault);
    }

    static double costUsd(long inputTokens, long outputTokens, double inPerMTok, double outPerMTok) {
        return inputTokens / 1_000_000.0 * inPerMTok + outputTokens / 1_000_000.0 * outPerMTok;
    }

    int limitFor(User u) {
        Integer schoolLimit = schoolOf(u).map(School::getDailyQuestionLimit).orElse(null);
        return limitFor(u.getRole(), schoolLimit, studentDailyLimit, staffDailyLimit);
    }

    private java.util.Optional<School> schoolOf(User u) {
        String inst = u.getInstitution();
        return inst == null || inst.isBlank() ? java.util.Optional.empty() : schools.findByNameIgnoreCase(inst.trim());
    }

    private int add(String username, String institution, int requests, long in, long out) {
        return add(username, institution, requests, in, out, 0);
    }

    private int add(String username, String institution, int requests, long in, long out, int images) {
        Integer n = jdbc.queryForObject(UPSERT, Integer.class, username, institution, today(), requests, in, out, images);
        return n == null ? 0 : n;
    }

    /**
     * Counts one question for {@code username} before it goes to the AI, refusing
     * it with {@link DailyLimitException} when today's limit is already reached.
     */
    public void beforeQuestion(String username) {
        User u = users.findByUsername(username).orElse(null);
        if (u == null) return;
        int limit = limitFor(u);
        int used = add(u.getUsername(), u.getInstitution(), 1, 0, 0);
        if (limit > 0 && used > limit) {
            add(u.getUsername(), u.getInstitution(), -1, 0, 0); // not asked after all
            throw new DailyLimitException(limit);
        }
    }

    /** Today's limit for the signed-in user: { limit (0 = none), used, remaining }. */
    public Map<String, Object> status(String username) {
        User u = users.findByUsername(username).orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        int limit = limitFor(u);
        List<Integer> rows = jdbc.queryForList(
                "SELECT requests FROM ai_usage WHERE username = ? AND day = ?", Integer.class, u.getUsername(), today());
        int used = rows.isEmpty() || rows.get(0) == null ? 0 : rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("limit", limit);
        out.put("used", used);
        out.put("remaining", limit == 0 ? null : Math.max(0, limit - used));
        return out;
    }

    /** Adds a model call's tokens to the signed-in user's row. Never fails the call. */
    @Override
    public void record(long inputTokens, long outputTokens) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())
                    ? BACKGROUND : auth.getName();
            String institution = BACKGROUND.equals(username) ? null
                    : users.findByUsername(username).map(User::getInstitution).orElse(null);
            add(username, institution, 0, inputTokens, outputTokens);
        } catch (RuntimeException e) {
            log.warn("Could not record AI usage ({} in / {} out tokens): {}", inputTokens, outputTokens, e.getMessage());
        }
    }

    /** Counts one story picture for the signed-in user (priced at learnmate.ai.price.image-usd). Never fails. */
    @Override
    public void recordImage() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())
                    ? BACKGROUND : auth.getName();
            String institution = BACKGROUND.equals(username) ? null
                    : users.findByUsername(username).map(User::getInstitution).orElse(null);
            add(username, institution, 0, 0, 0, 1);
        } catch (RuntimeException e) {
            log.warn("Could not record a story picture: {}", e.getMessage());
        }
    }

    // ------------------------------------------------------------------ report

    /**
     * AI use and estimated cost from {@code from} to {@code to} (inclusive):
     * one row per school, the heaviest users and a per-day series. {@code onlySchool}
     * null = every school (owner); otherwise just that school.
     */
    public Map<String, Object> report(LocalDate from, LocalDate to, String onlySchool) {
        String scope = onlySchool == null ? "" : " AND lower(a.institution) = lower(?)";
        List<Object> args = new ArrayList<>(List.of(from, to));
        if (onlySchool != null) args.add(onlySchool);

        // Students per school, for "active students" out of how many.
        Map<String, Long> studentsPerSchool = new LinkedHashMap<>();
        for (User u : users.findAll()) {
            if ("USER".equals(u.getRole()) && u.getInstitution() != null) {
                studentsPerSchool.merge(u.getInstitution().trim().toLowerCase(), 1L, Long::sum);
            }
        }
        Map<String, School> schoolByName = new LinkedHashMap<>();
        for (School s : schools.findAll()) schoolByName.put(s.getName().trim().toLowerCase(), s);

        List<Map<String, Object>> schoolRows = new ArrayList<>();
        jdbc.query("""
                SELECT a.institution,
                       count(DISTINCT CASE WHEN u.role = 'USER' AND a.requests > 0 THEN a.username END) AS active_students,
                       count(DISTINCT CASE WHEN a.requests > 0 THEN a.username END) AS active_users,
                       coalesce(sum(a.requests), 0) AS requests,
                       coalesce(sum(a.input_tokens), 0) AS input_tokens,
                       coalesce(sum(a.output_tokens), 0) AS output_tokens,
                       coalesce(sum(a.images), 0) AS images
                FROM ai_usage a LEFT JOIN users u ON u.username = a.username
                WHERE a.day BETWEEN ? AND ?""" + scope + """
                 GROUP BY a.institution
                 ORDER BY coalesce(sum(a.output_tokens), 0) DESC
                """, rs -> {
            String inst = rs.getString("institution");
            String key = inst == null ? "" : inst.trim().toLowerCase();
            long in = rs.getLong("input_tokens");
            long out = rs.getLong("output_tokens");
            long pics = rs.getLong("images");
            long active = rs.getLong("active_students");
            School school = schoolByName.get(key);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("school", inst == null ? "" : inst);
            row.put("schoolId", school == null ? null : school.getId());
            row.put("dailyQuestionLimit", school == null ? null : school.getDailyQuestionLimit());
            row.put("students", studentsPerSchool.getOrDefault(key, 0L));
            row.put("activeStudents", active);
            row.put("activeUsers", rs.getLong("active_users"));
            row.put("requests", rs.getLong("requests"));
            row.put("inputTokens", in);
            row.put("outputTokens", out);
            row.put("images", pics);
            putCost(row, in, out, pics);
            row.put("costPerActiveStudentInr", active == 0 ? null
                    : round2(totalUsd(in, out, pics) * usdToInr / active));
            schoolRows.add(row);
        }, args.toArray());

        // Schools nobody used yet still appear (with zeros), so the owner sees every customer.
        for (School s : schools.findAllByOrderByNameAsc()) {
            if (onlySchool != null && !s.getName().trim().equalsIgnoreCase(onlySchool.trim())) continue;
            boolean listed = schoolRows.stream().anyMatch(r -> s.getName().trim().equalsIgnoreCase((String) r.get("school")));
            if (listed) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("school", s.getName());
            row.put("schoolId", s.getId());
            row.put("dailyQuestionLimit", s.getDailyQuestionLimit());
            row.put("students", studentsPerSchool.getOrDefault(s.getName().trim().toLowerCase(), 0L));
            row.put("activeStudents", 0L);
            row.put("activeUsers", 0L);
            row.put("requests", 0L);
            row.put("inputTokens", 0L);
            row.put("outputTokens", 0L);
            row.put("images", 0L);
            putCost(row, 0, 0, 0);
            row.put("costPerActiveStudentInr", null);
            schoolRows.add(row);
        }

        List<Map<String, Object>> topUsers = new ArrayList<>();
        List<Object> topArgs = new ArrayList<>(args);
        topArgs.add(inputPricePerMTok);
        topArgs.add(outputPricePerMTok);
        topArgs.add(imagePriceUsd * 1_000_000);
        jdbc.query("""
                SELECT a.username, max(a.institution) AS institution, coalesce(max(u.role), '') AS role,
                       coalesce(max(u.standard), '') AS standard,
                       coalesce(sum(a.requests), 0) AS requests,
                       coalesce(sum(a.input_tokens), 0) AS input_tokens,
                       coalesce(sum(a.output_tokens), 0) AS output_tokens,
                       coalesce(sum(a.images), 0) AS images
                FROM ai_usage a LEFT JOIN users u ON u.username = a.username
                WHERE a.day BETWEEN ? AND ?""" + scope + """
                 GROUP BY a.username
                 ORDER BY sum(a.input_tokens) * ? + sum(a.output_tokens) * ? + sum(a.images) * ? DESC
                 LIMIT 20
                """, rs -> {
            long in = rs.getLong("input_tokens");
            long out = rs.getLong("output_tokens");
            long pics = rs.getLong("images");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("username", rs.getString("username"));
            row.put("school", rs.getString("institution") == null ? "" : rs.getString("institution"));
            row.put("role", rs.getString("role"));
            row.put("standard", rs.getString("standard"));
            row.put("requests", rs.getLong("requests"));
            row.put("inputTokens", in);
            row.put("outputTokens", out);
            putCost(row, in, out, pics);
            topUsers.add(row);
        }, topArgs.toArray());

        List<Map<String, Object>> daily = new ArrayList<>();
        jdbc.query("""
                SELECT a.day, coalesce(sum(a.requests), 0) AS requests,
                       coalesce(sum(a.input_tokens), 0) AS input_tokens,
                       coalesce(sum(a.output_tokens), 0) AS output_tokens,
                       coalesce(sum(a.images), 0) AS images
                FROM ai_usage a
                WHERE a.day BETWEEN ? AND ?""" + scope + """
                 GROUP BY a.day ORDER BY a.day
                """, rs -> {
            long in = rs.getLong("input_tokens");
            long out = rs.getLong("output_tokens");
            long pics = rs.getLong("images");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("day", rs.getDate("day").toLocalDate().toString());
            row.put("requests", rs.getLong("requests"));
            putCost(row, in, out, pics);
            daily.add(row);
        }, args.toArray());

        long totalIn = schoolRows.stream().mapToLong(r -> (Long) r.get("inputTokens")).sum();
        long totalOut = schoolRows.stream().mapToLong(r -> (Long) r.get("outputTokens")).sum();
        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("requests", schoolRows.stream().mapToLong(r -> (Long) r.get("requests")).sum());
        totals.put("inputTokens", totalIn);
        totals.put("outputTokens", totalOut);
        long totalPics = schoolRows.stream().mapToLong(r -> (Long) r.get("images")).sum();
        totals.put("images", totalPics);
        putCost(totals, totalIn, totalOut, totalPics);

        Map<String, Object> prices = new LinkedHashMap<>();
        prices.put("model", model);
        prices.put("inputPerMTokUsd", inputPricePerMTok);
        prices.put("outputPerMTokUsd", outputPricePerMTok);
        prices.put("imageUsd", imagePriceUsd);
        prices.put("usdToInr", usdToInr);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", from.toString());
        out.put("to", to.toString());
        out.put("defaultStudentDailyLimit", studentDailyLimit);
        out.put("prices", prices);
        out.put("totals", totals);
        out.put("schools", schoolRows);
        out.put("topUsers", topUsers);
        out.put("daily", daily);
        return out;
    }

    private double totalUsd(long in, long out, long images) {
        return costUsd(in, out, inputPricePerMTok, outputPricePerMTok) + images * imagePriceUsd;
    }

    private void putCost(Map<String, Object> row, long in, long out, long images) {
        double usd = totalUsd(in, out, images);
        row.put("costUsd", round2(usd));
        row.put("costInr", round2(usd * usdToInr));
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}

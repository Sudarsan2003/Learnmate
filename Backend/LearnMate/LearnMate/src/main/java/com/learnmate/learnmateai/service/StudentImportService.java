package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Creates student accounts from a class list (Excel .xlsx/.xls or .csv).
 *
 * Columns are matched by header name, in any order. Only Name (or Username)
 * and Class are needed; a missing username is made from the name and a
 * missing password is generated. The whole file is checked first and nothing
 * is created unless every row is valid, so a school never ends up with half a
 * class imported. A dry run returns the same checks without saving anything.
 *
 * Excel reading comes from Apache POI, which tika-parsers-standard-package
 * already brings in for document uploads.
 */
@Service
public class StudentImportService {

    public static final int MAX_ROWS = 2000;

    public record ImportRow(int row, String fullName, String username, String standard, String email,
                            String mobile, String password, boolean usernameGenerated, boolean passwordGenerated) {}

    public record RowError(int row, String message) {}

    public record ImportResult(boolean dryRun, int created, String institution,
                               List<ImportRow> rows, List<RowError> errors) {}

    // Header names (lower-case, spaces and punctuation removed) -> our field.
    private static final Map<String, String> HEADERS = Map.ofEntries(
            Map.entry("name", "name"), Map.entry("fullname", "name"), Map.entry("studentname", "name"),
            Map.entry("username", "username"), Map.entry("userid", "username"), Map.entry("login", "username"),
            Map.entry("class", "standard"), Map.entry("standard", "standard"), Map.entry("grade", "standard"),
            Map.entry("password", "password"),
            Map.entry("email", "email"), Map.entry("emailaddress", "email"), Map.entry("parentemail", "email"),
            Map.entry("mobile", "mobile"), Map.entry("phone", "mobile"), Map.entry("mobilenumber", "mobile"),
            Map.entry("parentmobile", "mobile"), Map.entry("phonenumber", "mobile"),
            Map.entry("gender", "gender"));

    private static final Pattern USERNAME = Pattern.compile("[A-Za-z0-9._-]{3,40}");
    private static final Pattern EMAIL = Pattern.compile("[^@\\s]+@[^@\\s]+\\.[^@\\s]+");
    private static final String PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    public StudentImportService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public ImportResult importStudents(MultipartFile file, String institution, boolean dryRun) {
        if (institution == null || institution.isBlank()) {
            throw new IllegalArgumentException("Choose which school these students belong to.");
        }
        List<Map<String, String>> records = read(file);
        if (records.isEmpty()) {
            throw new IllegalArgumentException("The file has a header row but no students under it.");
        }
        if (records.size() > MAX_ROWS) {
            throw new IllegalArgumentException("That file has " + records.size() + " rows; import at most "
                    + MAX_ROWS + " at a time.");
        }

        List<RowError> errors = new ArrayList<>();
        List<ImportRow> rows = new ArrayList<>();
        Set<String> takenInFile = new HashSet<>();
        Set<String> emailsInFile = new HashSet<>();
        // Usernames the file asks for explicitly; generated ones steer around them.
        Set<String> requested = new HashSet<>();
        records.forEach(r -> requested.add(clean(r.get("username")).toLowerCase(Locale.ROOT)));

        for (int i = 0; i < records.size(); i++) {
            int rowNo = i + 2; // spreadsheet row number: row 1 is the header
            Map<String, String> r = records.get(i);
            String name = clean(r.get("name"));
            String username = clean(r.get("username"));
            String standard = normaliseClass(clean(r.get("standard")));
            String email = clean(r.get("email"));
            String mobile = clean(r.get("mobile"));
            String password = clean(r.get("password"));

            if (name.isEmpty() && username.isEmpty()) {
                errors.add(new RowError(rowNo, "Needs a name or a username."));
                continue;
            }
            if (standard.isEmpty()) {
                errors.add(new RowError(rowNo, "Class is missing."));
            }

            boolean usernameGenerated = username.isEmpty();
            // Same name already in this class: most likely the list is being imported
            // twice. A real namesake can still be added by giving them a username.
            if (usernameGenerated && !name.isEmpty() && !standard.isEmpty()) {
                Optional<User> existing = userRepository.findFirstByInstitutionAndStandardAndFullNameIgnoreCase(
                        institution, standard, name);
                if (existing.isPresent()) {
                    errors.add(new RowError(rowNo, name + " is already in class " + standard + " (username "
                            + existing.get().getUsername() + "). Remove this row, or give a username if it's a different student."));
                    continue;
                }
            }
            if (usernameGenerated) {
                username = uniqueUsername(name, standard, takenInFile, requested);
            } else if (!USERNAME.matcher(username).matches()) {
                errors.add(new RowError(rowNo, "Username \"" + username + "\" must be 3-40 letters, numbers, dots, dashes or underscores."));
            } else if (!takenInFile.add(username.toLowerCase(Locale.ROOT))) {
                errors.add(new RowError(rowNo, "Username \"" + username + "\" appears more than once in the file."));
            } else if (userRepository.existsByUsernameIgnoreCase(username)) {
                errors.add(new RowError(rowNo, "Username \"" + username + "\" is already taken."));
            }

            if (!email.isEmpty()) {
                if (!EMAIL.matcher(email).matches()) {
                    errors.add(new RowError(rowNo, "\"" + email + "\" is not a valid email address."));
                } else if (!emailsInFile.add(email.toLowerCase(Locale.ROOT)) || userRepository.existsByEmailIgnoreCase(email)) {
                    errors.add(new RowError(rowNo, "Email " + email + " is already used by another account."));
                }
            }

            boolean passwordGenerated = password.isEmpty();
            if (!passwordGenerated && password.length() < 6) {
                errors.add(new RowError(rowNo, "Password must be at least 6 characters (or leave it blank to generate one)."));
            }

            rows.add(new ImportRow(rowNo, name, username, standard, email, mobile,
                    passwordGenerated ? null : password, usernameGenerated, passwordGenerated));
        }

        if (dryRun || !errors.isEmpty()) {
            // Never echo passwords from the file back in a preview.
            List<ImportRow> preview = rows.stream()
                    .map(r -> new ImportRow(r.row(), r.fullName(), r.username(), r.standard(), r.email(), r.mobile(),
                            null, r.usernameGenerated(), r.passwordGenerated()))
                    .toList();
            return new ImportResult(true, 0, institution, preview, errors);
        }

        List<ImportRow> created = new ArrayList<>();
        List<User> users = new ArrayList<>();
        for (ImportRow r : rows) {
            String password = r.passwordGenerated() ? newPassword() : r.password();
            User u = new User();
            u.setUsername(r.username());
            u.setFullName(r.fullName().isEmpty() ? null : r.fullName());
            u.setPasswordHash(passwordEncoder.encode(password));
            u.setRole("USER");
            u.setInstitution(institution);
            u.setStandard(r.standard());
            u.setEmail(r.email().isEmpty() ? null : r.email());
            u.setMobile(r.mobile().isEmpty() ? null : r.mobile());
            users.add(u);
            // Only generated passwords go back to the admin (to hand out); ones the
            // school typed into the file they already have.
            created.add(new ImportRow(r.row(), r.fullName(), r.username(), r.standard(), r.email(), r.mobile(),
                    r.passwordGenerated() ? password : null, r.usernameGenerated(), r.passwordGenerated()));
        }
        userRepository.saveAll(users);
        return new ImportResult(false, users.size(), institution, created, List.of());
    }

    // ------------------------------------------------------------------ reading the file

    private List<Map<String, String>> read(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Choose an Excel or CSV file to import.");
        }
        String name = Optional.ofNullable(file.getOriginalFilename()).orElse("").toLowerCase(Locale.ROOT);
        try (InputStream in = file.getInputStream()) {
            List<List<String>> table = name.endsWith(".csv") ? readCsv(in) : readExcel(in);
            return toRecords(table);
        } catch (IOException | RuntimeException e) {
            if (e instanceof IllegalArgumentException iae) throw iae;
            throw new IllegalArgumentException("Couldn't read that file. Save it as .xlsx or .csv and try again.");
        }
    }

    private List<List<String>> readExcel(InputStream in) throws IOException {
        DataFormatter fmt = new DataFormatter(); // the text as Excel shows it, so class 9 stays "9", not "9.0"
        List<List<String>> table = new ArrayList<>();
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getSheetAt(0);
            for (Row row : sheet) {
                List<String> cells = new ArrayList<>();
                for (int c = 0; c < Math.max(row.getLastCellNum(), 0); c++) {
                    Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                    cells.add(cell == null ? "" : fmt.formatCellValue(cell));
                }
                table.add(cells);
            }
        }
        return table;
    }

    private List<List<String>> readCsv(InputStream in) throws IOException {
        List<List<String>> table = new ArrayList<>();
        try (Reader reader = new InputStreamReader(in, StandardCharsets.UTF_8);
             CSVParser parser = CSVFormat.DEFAULT.builder().setIgnoreEmptyLines(true).build().parse(reader)) {
            for (CSVRecord rec : parser) {
                List<String> cells = new ArrayList<>();
                rec.forEach(cells::add);
                table.add(cells);
            }
        }
        return table;
    }

    /** First non-empty row is the header; maps each later non-empty row to our field names. */
    private List<Map<String, String>> toRecords(List<List<String>> table) {
        int headerAt = -1;
        for (int i = 0; i < table.size(); i++) {
            if (table.get(i).stream().anyMatch(c -> !clean(c).isEmpty())) {
                headerAt = i;
                break;
            }
        }
        if (headerAt < 0) throw new IllegalArgumentException("The file is empty.");

        List<String> header = table.get(headerAt);
        String[] fields = new String[header.size()];
        for (int c = 0; c < header.size(); c++) {
            String key = clean(header.get(c)).replace("﻿", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
            fields[c] = HEADERS.get(key);
        }
        Set<String> found = new HashSet<>(Arrays.stream(fields).filter(Objects::nonNull).toList());
        if (!found.contains("standard") || !(found.contains("name") || found.contains("username"))) {
            throw new IllegalArgumentException("The first row must be column headings, including Name (or Username) "
                    + "and Class. Download the template to see the layout.");
        }

        List<Map<String, String>> records = new ArrayList<>();
        for (int i = headerAt + 1; i < table.size(); i++) {
            List<String> cells = table.get(i);
            if (cells.stream().allMatch(c -> clean(c).isEmpty())) continue;
            Map<String, String> rec = new HashMap<>();
            for (int c = 0; c < Math.min(cells.size(), fields.length); c++) {
                if (fields[c] != null) rec.put(fields[c], cells.get(c));
            }
            records.add(rec);
        }
        return records;
    }

    // ------------------------------------------------------------------ helpers

    private static String clean(String s) {
        return s == null ? "" : s.replace(' ', ' ').trim().replaceAll("\\s{2,}", " ");
    }

    /** "Class 9", "9th", "IX" and "Grade 9" all mean class "9", matching how sign-up stores it. */
    static String normaliseClass(String raw) {
        String s = raw.toLowerCase(Locale.ROOT).replaceAll("^(class|std|standard|grade)\\s*", "").trim();
        s = s.replaceAll("^(\\d{1,2})(st|nd|rd|th)$", "$1");
        Map<String, String> roman = Map.of("i", "1", "ii", "2", "iii", "3", "iv", "4", "v", "5",
                "vi", "6", "vii", "7", "viii", "8", "ix", "9", "x", "10");
        if (roman.containsKey(s)) return roman.get(s);
        return s.matches("\\d{1,2}") ? String.valueOf(Integer.parseInt(s)) : raw.trim();
    }

    /** "Ravi Kumar" -> "ravi.kumar", then "ravi.kumar2", ... until free in the file and the database. */
    private String uniqueUsername(String name, String standard, Set<String> takenInFile, Set<String> requested) {
        String base = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", ".")
                .replaceAll("^\\.+|\\.+$", "");
        if (base.length() < 3) {
            // e.g. a name written only in Telugu or Hindi script
            base = "student" + (standard.isEmpty() ? "" : standard);
        }
        if (base.length() > 30) base = base.substring(0, 30).replaceAll("\\.+$", "");
        String candidate = base;
        for (int n = 2; takenInFile.contains(candidate) || requested.contains(candidate)
                || userRepository.existsByUsernameIgnoreCase(candidate); n++) {
            candidate = base + n;
        }
        takenInFile.add(candidate);
        return candidate;
    }

    private String newPassword() {
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) sb.append(PASSWORD_ALPHABET.charAt(random.nextInt(PASSWORD_ALPHABET.length())));
        return sb.toString();
    }
}

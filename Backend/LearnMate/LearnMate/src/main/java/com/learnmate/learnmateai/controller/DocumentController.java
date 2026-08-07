package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.service.IngestionService;
import com.learnmate.learnmateai.service.IngestionStatusService;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/documents")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
public class DocumentController {

    private final IngestionService ingestionService;
    private final DocumentChunkRepository repository;
    private final IngestionStatusService statusService;
    private final UserRepository userRepository;

    public DocumentController(IngestionService ingestionService,
                              DocumentChunkRepository repository,
                              IngestionStatusService statusService,
                              UserRepository userRepository) {
        this.ingestionService = ingestionService;
        this.repository = repository;
        this.statusService = statusService;
        this.userRepository = userRepository;
    }

    // Returns immediately once the file is read into memory; parsing, OCR,
    // and embedding happen on a background thread. Poll /status/{sourceId}
    // for progress instead of waiting on this response.
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "subject", required = false, defaultValue = "general") String subject,
            @RequestParam("standard") String standard, // "1".."10" — which class folder this belongs to
            @RequestParam(value = "institution", required = false) String institutionParam,
            Authentication auth
    ) throws IOException {
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        String institution = resolveInstitution(user, institutionParam, auth);

        String sourceId = ingestionService.startIngestion(file, subject, standard, institution, auth.getName());

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "sourceId", sourceId,
                "status", "PROCESSING"
        ));
    }

    // Admins upload material on behalf of any school, so their request must
    // say explicitly which institution it's for — there's no "their own
    // school" to default to. Teachers are always scoped to their own
    // account's institution; any institution value they send is ignored so a
    // teacher can never upload into another school's knowledge base.
    private String resolveInstitution(User user, String institutionParam, Authentication auth) {
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));

        if (isAdmin) {
            if (institutionParam == null || institutionParam.isBlank()) {
                throw new IllegalArgumentException("institution is required for admin uploads");
            }
            return institutionParam.trim();
        }

        return user.getInstitution();
    }

    @GetMapping("/status/{sourceId}")
    public ResponseEntity<Map<String, Object>> status(@PathVariable String sourceId, Authentication auth) {
        IngestionStatusService.IngestionStatus status = statusService.getStatus(auth.getName(), sourceId);

        if (status == null) {
            boolean exists = !repository.findByOwnerUsername(auth.getName()).stream()
                    .filter(c -> c.getSourceId().equals(sourceId))
                    .toList().isEmpty();

            return ResponseEntity.ok(Map.of(
                    "sourceId", sourceId,
                    "status", exists ? "DONE" : "UNKNOWN"
            ));
        }

        return ResponseEntity.ok(Map.of(
                "sourceId", status.sourceId(),
                "status", status.state().name(),
                "message", status.message(),
                "chunkCount", status.chunkCount(),
                "updatedAt", status.updatedAt().toString()
        ));
    }

    // Powers the folder picker in the upload UI: every standard that
    // already has at least one document for this admin/teacher's school.
    // The frontend shows these as selectable "folders" plus a "create new"
    // option, instead of a free-text box that lets the same class get
    // fragmented into differently-typed standards ("5", "Grade 5", "5th").
    @GetMapping("/standards")
    public List<String> listStandards(@RequestParam(value = "institution", required = false) String institutionParam,
                                      Authentication auth) {
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        String institution = resolveInstitutionForRead(user, institutionParam, auth);

        return repository.findDistinctStandardsByInstitution(institution);
    }

    // Same admin-vs-teacher institution scoping as uploads, but for reads:
    // an admin can look at any school's folders by passing ?institution=,
    // a teacher always sees only their own school's regardless of what's
    // passed.
    private String resolveInstitutionForRead(User user, String institutionParam, Authentication auth) {
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));

        if (isAdmin && institutionParam != null && !institutionParam.isBlank()) {
            return institutionParam.trim();
        }

        return user.getInstitution();
    }

    // Scoped by institution + standard now — any teacher/admin at the same
    // school sees the same class folder's documents, not just their own uploads.
    @GetMapping
    public List<Map<String, Object>> list(@RequestParam String standard,
                                          @RequestParam(value = "institution", required = false) String institutionParam,
                                          Authentication auth) {
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        String institution = resolveInstitutionForRead(user, institutionParam, auth);

        List<DocumentChunk> docs = repository.findByInstitutionAndStandard(institution, standard);

        return docs.stream()
                .collect(Collectors.groupingBy(DocumentChunk::getSourceId))
                .entrySet().stream()
                .map(e -> Map.<String, Object>of(
                        "id", e.getKey(),
                        "source", e.getKey(),
                        "subject", e.getValue().get(0).getSubject(),
                        "standard", e.getValue().get(0).getStandard(),
                        "chunkCount", e.getValue().size(),
                        "uploadedAt", e.getValue().get(0).getUploadedAt()
                ))
                .toList();
    }

    // Admin-only: every document across every institution and standard, so
    // an admin can audit or clean up the whole knowledge base from one view
    // instead of paging through institution/standard filters one at a time.
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/all")
    public List<Map<String, Object>> listAll() {
        List<DocumentChunk> docs = repository.findAll();

        return docs.stream()
                .collect(Collectors.groupingBy(DocumentChunk::getSourceId))
                .entrySet().stream()
                .map(e -> Map.<String, Object>of(
                        "id", e.getKey(),
                        "source", e.getKey(),
                        "subject", e.getValue().get(0).getSubject(),
                        "standard", e.getValue().get(0).getStandard(),
                        "institution", e.getValue().get(0).getInstitution(),
                        "ownerUsername", e.getValue().get(0).getOwnerUsername(),
                        "chunkCount", e.getValue().size(),
                        "uploadedAt", e.getValue().get(0).getUploadedAt()
                ))
                .toList();
    }

    // Admins can delete any document regardless of who uploaded it or which
    // school it belongs to; teachers can still only delete their own uploads.
    @DeleteMapping("/{sourceId}")
    @Transactional
    public void delete(@PathVariable String sourceId, Authentication auth) {
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));

        if (isAdmin) {
            repository.deleteBySourceId(sourceId);
        } else {
            repository.deleteBySourceIdAndOwnerUsername(sourceId, auth.getName());
        }
    }
}
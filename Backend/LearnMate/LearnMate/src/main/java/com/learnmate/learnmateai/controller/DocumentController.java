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
            Authentication auth
    ) throws IOException {
        String sourceId = ingestionService.startIngestion(file, subject, standard, auth.getName());

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "sourceId", sourceId,
                "status", "PROCESSING"
        ));
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

    // Scoped by institution + standard now — any teacher/admin at the same
    // school sees the same class folder's documents, not just their own uploads.
    @GetMapping
    public List<Map<String, Object>> list(@RequestParam String standard, Authentication auth) {
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        List<DocumentChunk> docs = repository.findByInstitutionAndStandard(user.getInstitution(), standard);

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

    @DeleteMapping("/{sourceId}")
    @Transactional
    public void delete(@PathVariable String sourceId, Authentication auth) {
        repository.deleteBySourceIdAndOwnerUsername(sourceId, auth.getName());
    }
}
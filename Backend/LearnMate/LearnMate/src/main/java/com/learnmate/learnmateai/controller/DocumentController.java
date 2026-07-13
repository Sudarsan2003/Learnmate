package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
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
@PreAuthorize("hasRole('ADMIN')") // belt-and-suspenders on top of SecurityConfig's matcher
public class DocumentController {

    private final IngestionService ingestionService;
    private final DocumentChunkRepository repository;
    private final IngestionStatusService statusService;

    public DocumentController(IngestionService ingestionService,
                              DocumentChunkRepository repository,
                              IngestionStatusService statusService) {
        this.ingestionService = ingestionService;
        this.repository = repository;
        this.statusService = statusService;
    }

    // Returns immediately once the file is read into memory; parsing, OCR,
    // and embedding happen on a background thread. Poll /status/{sourceId}
    // for progress instead of waiting on this response — large/scanned
    // documents can take several minutes and would otherwise hit Render's
    // proxy timeout.
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "subject", required = false, defaultValue = "general") String subject,
            Authentication auth
    ) throws IOException {
        String sourceId = ingestionService.startIngestion(file, subject, auth.getName());

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "sourceId", sourceId,
                "status", "PROCESSING"
        ));
    }

    @GetMapping("/status/{sourceId}")
    public ResponseEntity<Map<String, Object>> status(@PathVariable String sourceId, Authentication auth) {
        IngestionStatusService.IngestionStatus status = statusService.getStatus(auth.getName(), sourceId);

        if (status == null) {
            // No in-memory record (e.g. app restarted, or ingestion finished
            // a while ago) — fall back to checking whether chunks exist.
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

    // Scoped: an admin only ever sees documents they personally uploaded.
    @GetMapping
    public List<Map<String, Object>> list(Authentication auth) {
        List<DocumentChunk> mine = repository.findByOwnerUsername(auth.getName());

        return mine.stream()
                .collect(Collectors.groupingBy(DocumentChunk::getSourceId))
                .entrySet().stream()
                .map(e -> Map.<String, Object>of(
                        "id", e.getKey(),          // frontend uses this for delete/reprocess/key
                        "source", e.getKey(),      // frontend displays this
                        "subject", e.getValue().get(0).getSubject(),
                        "chunkCount", e.getValue().size(),
                        "uploadedAt", e.getValue().get(0).getUploadedAt()
                ))
                .toList();
    }

    @DeleteMapping("/{sourceId}")
    @Transactional
    public void delete(@PathVariable String sourceId,
                       Authentication auth) {

        repository.deleteBySourceIdAndOwnerUsername(
                sourceId,
                auth.getName()
        );
    }

}
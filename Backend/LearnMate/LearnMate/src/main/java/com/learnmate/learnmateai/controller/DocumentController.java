package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.learnmate.learnmateai.service.IngestionService;
import jakarta.transaction.Transactional;
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

    public DocumentController(IngestionService ingestionService, DocumentChunkRepository repository) {
        this.ingestionService = ingestionService;
        this.repository = repository;
    }

    @PostMapping("/upload")
    public List<DocumentChunk> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "subject", required = false, defaultValue = "general") String subject,
            Authentication auth
    ) throws IOException {
        return ingestionService.ingest(file, subject, auth.getName());
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
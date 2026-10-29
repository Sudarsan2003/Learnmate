package com.learnmate.learnmateai.orchestrator;

import com.learnmate.learnmateai.agent.EvaluationAgent;
import com.learnmate.learnmateai.agent.LearningAgent;
import com.learnmate.learnmateai.agent.RetrievalAgent;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.service.ChatHistoryService;
import com.learnmate.learnmateai.service.ChatQuizAttemptService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class BooksOutlineTest {

    private final DocumentChunkRepository chunks = mock(DocumentChunkRepository.class);
    private final AgentOrchestrator orchestrator = new AgentOrchestrator(
            mock(RetrievalAgent.class), mock(LearningAgent.class), mock(EvaluationAgent.class),
            mock(ChatHistoryService.class), mock(UserRepository.class), mock(ChatQuizAttemptService.class), chunks);

    @Test
    void listsEveryBookWithItsChaptersInOrder() {
        User student = new User();
        student.setInstitution("School");
        student.setStandard("9");
        when(chunks.findMaterials("School", "9")).thenReturn(List.of(
                new Object[]{"a", "9thClass_Physics_SEM-1_Textbook.pdf", "physics"},
                new Object[]{"b", "9thClass_Physics_SEM-2_Textbook.pdf", "physics"}));
        when(chunks.findPieceHeaders("School", "9")).thenReturn(List.of(
                "9thClass Physics SEM-1 Textbook | Chapter 7: Motion",
                "9thClass Physics SEM-1 Textbook | Chapter 10: Gravitation",
                "9thClass Physics SEM-1 Textbook | Chapter 1: Matter in Our Surroundings",
                "9thClass Physics SEM-1 Textbook",                 // front matter, no chapter
                "Some line from an older upload without a header"));

        assertThat(orchestrator.booksOutline(student)).isEqualTo(
                "- 9thClass Physics SEM-1 Textbook: Chapter 1: Matter in Our Surroundings; Chapter 7: Motion; "
                        + "Chapter 10: Gravitation\n"
                        + "- 9thClass Physics SEM-2 Textbook");
    }
}

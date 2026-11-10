package com.learnmate.learnmateai.llm;

/**
 * Told the tokens of every model call, so AI cost can be reported per user and
 * school (implemented by service.AiUsageService).
 */
public interface LlmUsageRecorder {

    void record(long inputTokens, long outputTokens);
}

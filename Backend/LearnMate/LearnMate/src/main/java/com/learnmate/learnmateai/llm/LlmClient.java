package com.learnmate.learnmateai.llm;

public interface LlmClient {

    String complete(String systemPrompt, String userPrompt);

    /**
     * Vision-capable completion: same as complete(), but also attaches an
     * image (base64-encoded) to the user turn. Default implementation throws
     * so that adding this method doesn't silently break LlmClient
     * implementations that aren't backed by a vision-capable model --
     * callers that need vision must get an explicit failure, not a client
     * that quietly ignores the image and answers from the text alone.
     *
     * @param base64ImageData raw base64 image bytes (no "data:" prefix)
     * @param mediaType       one of "image/jpeg", "image/png", "image/gif", "image/webp"
     */
    default String completeWithImage(String systemPrompt, String userPrompt, String base64ImageData, String mediaType) {
        throw new UnsupportedOperationException(
                getClass().getSimpleName() + " does not support image input."
        );
    }
}
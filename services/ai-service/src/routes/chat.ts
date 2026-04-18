import { Router } from "express";
import {
  streamText,
  type ModelMessage,
  stepCountIs,
  createUIMessageStream,
  generateObject,
  pipeUIMessageStreamToResponse,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { logger } from "../lib/utils/logger";
import { createRAGTools } from "../lib/ai/tools";
import { SYSTEM_PROMPT } from "../lib/ai/prompts";
import { recallCitizenMemories } from "../lib/rag/memory";

export interface ChatOptions {
  messages: ModelMessage[];
  tenantId?: string;
  email?: string;
  sessionId?: string;
}

/**
 * Generate follow-up suggestions in parallel
 * Uses a separate, cheaper model for fast generation
 */
async function generateSuggestions(
  messages: ModelMessage[],
  userLanguage: string = "English"
): Promise<string[]> {
  try {
    // Get the last few messages for context
    const recentMessages = messages.slice(-4);
    const context = recentMessages
      .map(
        (m) =>
          `${m.role}: ${typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content)
          }`
      )
      .join("\n");

    const useGroq = process.env.USE_GROQ === "true";
    const { object } = await generateObject({
      model: useGroq ? groq("llama-3.1-8b-instant") : openai("gpt-4o-mini"), // Fast, cheap model
      schema: z.object({
        suggestions: z
          .array(z.string())
          .max(3)
          .describe("Follow-up question suggestions the user might ask"),
      }),
// Generate follow-up civic suggestions
      prompt: `You are generating follow-up questions for a Smart Civic Intelligence chatbot.

Based on this conversation:
${context}

Generate 2-3 follow-up questions the citizen would likely ask. Focus on:
- Filing or tracking complaints
- Status updates
- Government work in their area
- Nearby civic issues

Generate in ${userLanguage} language. Keep under 60 characters each.`,
    });

    return object.suggestions;
  } catch (error) {
    logger.error("Failed to generate suggestions:", error);
    return [];
  }
}

/**
 * Detect user's language from the last message
 */
function detectLanguage(messages: ModelMessage[]): string {
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMessage) return "English";

  const content =
    typeof lastUserMessage.content === "string" ? lastUserMessage.content : "";

  // Simple detection based on script
  if (/[\u0900-\u097F]/.test(content)) return "Hindi";
  if (/[\u0B80-\u0BFF]/.test(content)) return "Tamil";
  if (/[\u0C00-\u0C7F]/.test(content)) return "Telugu";
  if (/[\u0980-\u09FF]/.test(content)) return "Bengali";
  if (/[\u0A80-\u0AFF]/.test(content)) return "Gujarati";
  if (/[\u0C80-\u0CFF]/.test(content)) return "Kannada";
  if (/[\u0D00-\u0D7F]/.test(content)) return "Malayalam";
  if (/[\u0A00-\u0A7F]/.test(content)) return "Punjabi";
  if (/[\u0B00-\u0B7F]/.test(content)) return "Odia";

  return "English";
}

/**
 * Create a streaming chat response using Vercel AI SDK v5
 * Uses parallel streaming: main response + suggestions generated concurrently
 *
 * @param options Chat configuration options
 * @returns UIMessageStream that streams both response and suggestions
 */
export function createChatStream(options: ChatOptions) {
  const { messages, tenantId, email, sessionId } = options;
  const useGemini = process.env.USE_GEMINI === "true";
  const useGroq = process.env.USE_GROQ === "true";
  const model = useGroq 
    ? groq("llama-3.3-70b-versatile")
    : useGemini
    ? google("gemini-2.0-flash-exp")
    : openai("gpt-4o-mini");

  logger.info(`Using ${useGroq ? "Groq LLaMA 3.3" : useGemini ? "Google Gemini" : "OpenAI GPT-4o-mini"} model`);
  if (tenantId) logger.info(`Civic tools enabled for tenant: ${tenantId}`);

  // Civic RAG tools scoped to the city tenant
  const tools = tenantId ? createRAGTools(tenantId, email, sessionId) : {};

  // Detect user language for suggestions
  const userLanguage = detectLanguage(messages);

  // Create a combined stream with parallel execution
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      logger.info("Starting parallel streams: main response + suggestions");

      let dynamicSystemPrompt = SYSTEM_PROMPT;
      // Fetch relevant persistent memory first
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
      const userText = lastUserMessage && typeof lastUserMessage.content === "string" ? lastUserMessage.content : "";
      
      const citizenIdentifier = email || sessionId;
      if (tenantId && citizenIdentifier && userText) {
        const memories = await recallCitizenMemories(userText, tenantId, citizenIdentifier, 0.3, 3);
        if (memories.length > 0) {
          const memoryText = memories.map(m => m.memory_text).join("\n- ");
          dynamicSystemPrompt += `\n\n# PERSISTENT MEMORY CONTEXT\nHere are some details you noted from previous interactions with this citizen:\n- ${memoryText}\nUse this context if relevant to the current conversation.`;
        }
      }

      // 1. Main AI response stream
      const mainResult = streamText({
        model,
        system: dynamicSystemPrompt,
        messages,
        tools,
        toolChoice: "auto",
        stopWhen: stepCountIs(5),
        onError: (error) => {
          logger.error("Main stream error:", error);
        },
        onFinish: ({ finishReason, usage, text }) => {
          logger.info("Main stream finished", { finishReason, usage });
          // Log the raw AI response text to check formatting
          console.log("\n========== RAW AI RESPONSE ==========");
          console.log(text);
          console.log("=====================================\n");
        },
      });

      // 2. Start suggestion generation immediately (in parallel)
      const suggestionsPromise = generateSuggestions(messages, userLanguage);
      logger.info("Suggestions generation started in parallel");

      // Merge the main response stream to the client
      writer.merge(mainResult.toUIMessageStream({ sendFinish: false }));

      // Wait for both to complete
      const [_, suggestions] = await Promise.all([
        mainResult.response, // Wait for main stream to complete
        suggestionsPromise, // Wait for suggestions
      ]);

      logger.info("Suggestions ready", { count: suggestions.length });

      // Write suggestions as a custom data part
      if (suggestions.length > 0) {
        writer.write({
          type: "data-suggestions",
          data: { suggestions },
        });
        logger.info("Suggestions written to stream");
      }
    },
    onError: (error) => {
      logger.error("Stream execution error:", error);
      return "An error occurred. Please try again.";
    },
  });

  return stream;
}

export const chatRouter = Router();

/**
 * Convert UIMessage[] (from AI SDK v5 frontend) to ModelMessage[]
 * The widget sends messages with `parts` arrays, but streamText expects
 * ModelMessage format with `content` as string or array.
 */
function convertToModelMessages(messages: any[]): ModelMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      // Already in correct format (string content)
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content } as ModelMessage;
      }

      // UIMessage format: has `parts` array
      if (Array.isArray(m.parts)) {
        const textParts = m.parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join(" ");
        return { role: m.role, content: textParts || "" } as ModelMessage;
      }

      // Fallback
      return { role: m.role, content: String(m.content || "") } as ModelMessage;
    })
    .filter((m) => typeof m.content === "string" && m.content.trim() !== "");
}

chatRouter.post("/chat", async (req, res) => {
  try {
    const tenantId = req.body.tenantId || (req.headers["x-tenant-id"] as string);
    const { messages, email, sessionId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Messages array is required" });
      return;
    }

    const modelMessages = convertToModelMessages(messages);
    if (modelMessages.length === 0) {
      res.status(400).json({ error: "No valid chat messages found" });
      return;
    }

    const stream = createChatStream({
      messages: modelMessages,
      tenantId,
      email,
      sessionId,
    });
    pipeUIMessageStreamToResponse({
      response: res,
      stream,
    });
  } catch (error) {
    logger.error("Chat route error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

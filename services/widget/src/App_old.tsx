import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatWindow } from "./components/chat/ChatWindow";
import { EmailPrompt } from "./components/chat/EmailPrompt";
import { FloatingButton } from "./components/FloatingButton";
import { useWidgetState } from "./hooks/useWidgetState";
import { API_ENDPOINT, API_BASE_URL } from "./lib/constants";
import { getSessionId, getUserEmail, setUserEmail } from "./lib/session";
import type { WidgetInitOptions, ChatMessage } from "./types";

interface AppProps {
  config?: WidgetInitOptions;
}

function App({ config }: AppProps = {}) {
  const { isOpen, hasUnread, toggleOpen, close, markAsUnread } =
    useWidgetState();

  // Email state - check localStorage on mount
  const [userEmail, setUserEmailState] = useState<string | null>(() =>
    getUserEmail()
  );
  const [isIdentifying, setIsIdentifying] = useState(false);

  // Store voice history to include in text chat requests
  const voiceHistoryRef = useRef<ChatMessage[]>([]);

  // Store suggestions from data parts
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Exit fullscreen mode
  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        exitFullscreen();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isFullscreen, exitFullscreen]);

  // Identify user with the API
  const identifyUser = useCallback(
    async (email: string) => {
      setIsIdentifying(true);

      try {
        const apiBase = config?.apiEndpoint
          ? config.apiEndpoint.replace("/api/chat", "")
          : API_BASE_URL;

        const response = await fetch(`${apiBase}/api/user/identify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            collegeId: config?.collegeId || "default",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to identify user");
        }

        const data = await response.json();
        console.log("User identified:", data);

        // Save email to localStorage and state
        setUserEmail(email);
        setUserEmailState(email);
      } finally {
        setIsIdentifying(false);
      }
    },
    [config?.apiEndpoint, config?.collegeId]
  );

  // Handle skip - allow chat without email (no persistence)
  const handleSkipEmail = useCallback(() => {
    // Set a placeholder to indicate user skipped
    setUserEmailState("skipped");
  }, []);

  // ✅ v5: Use DefaultChatTransport with proper configuration
  const { messages, sendMessage, status } = useChat({
    messages: [
      {
        id: "greeting-1",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Hello their 🙏 I'm CampusSetu, your academic counseling assistant. I'm here to help with admissions, courses, placements, scholarships, and more. How can I assist you today?",
          },
        ],
      },
    ],
    transport: new DefaultChatTransport({
      api: config?.apiEndpoint || API_ENDPOINT,
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        collegeId: config?.collegeId,
      },
      credentials: "include",
      // Include voice history and email in every request
      prepareSendMessagesRequest: ({ messages, id }) => {
        // Always read email from localStorage (source of truth)
        // to avoid race conditions with state updates
        const persistedEmail = getUserEmail();
        const emailToSend =
          persistedEmail && persistedEmail !== "skipped"
            ? persistedEmail
            : undefined;

        return {
          body: {
            messages,
            id,
            collegeId: config?.collegeId,
            sessionId: getSessionId(),
            // Include email for conversation logging (only if not skipped)
            email: emailToSend,
            // Pass voice history so text AI has context from voice conversations
            voiceHistory: voiceHistoryRef.current.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
          },
        };
      },
    }),
    onError: (err) => {
      console.error("Chat error:", err);
      alert(
        `Error: ${err.message}. Make sure AI service is running on ${
          config?.apiEndpoint || API_ENDPOINT
        }`
      );
    },
    onFinish: ({ message }) => {
      // ✅ v5: onFinish receives an object with message property
      // Mark as unread if widget is closed when message arrives
      if (!isOpen && message.role === "assistant") {
        markAsUnread();
      }
    },
    // Capture custom data parts (like suggestions)
    onData: (dataPart: any) => {
      // Handle suggestions data part
      if (dataPart.type === "data-suggestions" && dataPart.data?.suggestions) {
        console.log("Received suggestions:", dataPart.data.suggestions);
        setSuggestions(dataPart.data.suggestions);
      }
    },
  });

  // Add initial greeting message if no messages exist
  useEffect(() => {
    if (messages.length === 0) {
      // Note: In a real implementation, you might want to add a greeting
      // without calling the API, or handle this differently
    }
  }, [messages.length]);

  const handleSendMessage = (content: string, voiceHistory?: ChatMessage[]) => {
    // Clear previous suggestions when sending new message
    setSuggestions([]);
    // Update voice history ref before sending message
    if (voiceHistory) {
      voiceHistoryRef.current = voiceHistory;
    }
    // ✅ v5: Use sendMessage with text field
    sendMessage({ text: content });
  };

  const handleToggle = () => toggleOpen();
  const handleMinimize = () => close();
  const handleClose = () => close();

  return (
    <div>
      {/* Chat widget - Show email prompt first if no email */}
      {isOpen && !userEmail && (
        <div className="fixed bottom-24 right-6 w-[380px] h-[500px] bg-background rounded-2xl shadow-2xl border flex flex-col overflow-hidden z-50">
          <EmailPrompt onSubmit={identifyUser} onSkip={handleSkipEmail} />
        </div>
      )}

      {/* Chat widget - Show chat window after email is provided or skipped */}
      {isOpen && userEmail && (
        <ChatWindow
          messages={messages}
          isLoading={status === "submitted"} // ✅ v5: Show loading only during submitted state (before streaming)
          onSendMessage={handleSendMessage}
          onMinimize={handleMinimize}
          onClose={handleClose}
          suggestions={suggestions}
          apiUrl={
            config?.apiEndpoint
              ? config.apiEndpoint.replace("/api/chat", "")
              : API_BASE_URL
          }
          collegeId={config?.collegeId}
          sessionId={getSessionId()}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}

      <FloatingButton
        onClick={handleToggle}
        unreadCount={hasUnread ? 1 : 0}
        isOpen={isOpen}
      />
    </div>
  );
}

export default App;

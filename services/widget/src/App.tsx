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
  const { isOpen, hasUnread, toggleOpen, close, markAsUnread } = useWidgetState();

  const [userEmail, setUserEmailState] = useState<string | null>(() => getUserEmail());
  const [, setIsIdentifying] = useState(false);

  const voiceHistoryRef = useRef<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => setIsFullscreen((prev) => !prev), []);
  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        exitFullscreen();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isFullscreen, exitFullscreen]);

  const identifyUser = useCallback(
    async (email: string) => {
      setIsIdentifying(true);
      try {
        const apiBase = config?.apiEndpoint
          ? config.apiEndpoint.replace("/api/chat", "")
          : API_BASE_URL;

        const response = await fetch(`${apiBase}/api/user/identify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            tenantId: config?.tenantId || "default",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to identify user");
        }

        setUserEmail(email);
        setUserEmailState(email);
      } finally {
        setIsIdentifying(false);
      }
    },
    [config?.apiEndpoint, config?.tenantId]
  );

  const handleSkipEmail = useCallback(() => {
    setUserEmailState("skipped");
  }, []);

  const { messages, sendMessage, status } = useChat({
    messages: [
      {
        id: "greeting-1",
        role: "assistant",
        content: "Hello! I am SCIRP+ Assistant, your civic reporting companion. You can tell me about a civic issue (like garbage, potholes, or streetlights) and I will guide you step-by-step to file a complaint. How can I help you today?",
      },
    ],
    transport: new DefaultChatTransport({
      api: config?.apiEndpoint || API_ENDPOINT,
      headers: { "Content-Type": "application/json" },
      body: { tenantId: config?.tenantId },
      credentials: "include",
      prepareSendMessagesRequest: ({ messages, id }) => {
        const persistedEmail = getUserEmail();
        const emailToSend = persistedEmail && persistedEmail !== "skipped" ? persistedEmail : undefined;
        return {
          body: {
            messages,
            id,
            tenantId: config?.tenantId,
            sessionId: getSessionId(),
            email: emailToSend,
            voiceHistory: voiceHistoryRef.current.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
          },
        };
      },
    }),
    onError: (err) => console.error("Chat error:", err),
    onFinish: ({ message }) => {
      if (!isOpen && message.role === "assistant") markAsUnread();
      
      // Auto-TTS for the standalone widget
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && message?.content) {
        window.speechSynthesis.cancel();
        const pureText = message.content.replace(/[*_#]/g, '');
        const utterance = new SpeechSynthesisUtterance(pureText);
        utterance.lang = 'en-US';
        const voices = window.speechSynthesis.getVoices();
        utterance.voice = voices.find(v => v.name.includes('Google') || v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Zira')) || null;
        window.speechSynthesis.speak(utterance);
      }
    },
    onData: (dataPart: any) => {
      if (dataPart.type === "data-suggestions" && dataPart.data?.suggestions) {
        setSuggestions(dataPart.data.suggestions);
      }
    },
  });

  const handleSendMessage = (content: string, voiceHistory?: ChatMessage[]) => {
    setSuggestions([]);
    if (voiceHistory) voiceHistoryRef.current = voiceHistory;
    sendMessage({ text: content });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4 relative">
      {/* 
        The widget is now 100% conversational. 
        When users interact with the Assistant, the LLM will ask them step-by-step
        for their Title, Description, and Location before using the submitComplaint tool.
      */}

      {isOpen && !userEmail && (
        <div className="fixed bottom-24 right-6 w-[380px] h-[500px] bg-background rounded-2xl shadow-2xl border flex flex-col overflow-hidden z-[99999]">
          <EmailPrompt onSubmit={identifyUser} onSkip={handleSkipEmail} />
        </div>
      )}

      {isOpen && userEmail && (
        <ChatWindow
          messages={messages}
          isLoading={status === "submitted"}
          onSendMessage={handleSendMessage}
          onMinimize={close}
          onClose={close}
          suggestions={suggestions}
          apiUrl={config?.apiEndpoint ? config.apiEndpoint.replace("/api/chat", "") : API_BASE_URL}
          tenantId={config?.tenantId}
          sessionId={getSessionId()}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}

      <FloatingButton onClick={toggleOpen} unreadCount={hasUnread ? 1 : 0} isOpen={isOpen} />
    </div>
  );
}

export default App;

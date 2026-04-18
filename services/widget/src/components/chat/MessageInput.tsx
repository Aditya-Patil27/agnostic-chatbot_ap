import { Button } from "@/components/ui/button";
import { Send, AudioLines, Loader2, PhoneOff, Paperclip, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAnimatedPlaceholder } from "@/hooks/useAnimatedPlaceholder";
import type { ChatMessage, Attachment } from "@/types";

interface MessageInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
  hasMessages?: boolean;
  isLoading?: boolean;
  // Voice call props
  apiUrl?: string;
  tenantId?: string;   // City identifier (replaces collegeId)
  sessionId?: string;
  onVoiceTranscript?: (transcript: ChatMessage) => void;
  inputRef?: React.RefObject<{
    setValue: (value: string) => void;
    focus: () => void;
  }> | null;
}

export function MessageInput({
  onSend,
  disabled,
  hasMessages = false,
  isLoading = false,
  apiUrl,
  tenantId,
  sessionId,
  onVoiceTranscript,
  inputRef,
}: MessageInputProps) {
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { placeholder } = useAnimatedPlaceholder();

  // Expose setValue and focus methods via ref
  useEffect(() => {
    if (inputRef && "current" in inputRef) {
      (inputRef as React.MutableRefObject<any>).current = {
        setValue: (value: string) => {
          setInput(value);
          // Focus textarea after setting value
          setTimeout(() => {
            textareaRef.current?.focus();
          }, 0);
        },
        focus: () => textareaRef.current?.focus(),
      };
    }
  }, [inputRef]);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const handleVoiceClick = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support the Web Speech API');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
      console.error('Speech recognition error', e.error);
      setIsListening(false);
    };
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput((prev) => prev ? prev + ' ' + transcript : transcript);
      // Auto-focus after speech
      setTimeout(() => textareaRef.current?.focus(), 100);
    };
    recognition.start();
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only allow images or videos (under ~10MB for data URLs usually, handle limits later if needed)
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      alert("Only images and videos are supported.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        setAttachment({
          url: event.target.result,
          name: file.name,
          contentType: file.type,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Clear for next upload
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || attachment) && !disabled) {
      onSend(input.trim(), attachment ? [attachment] : undefined);
      setInput("");
      setAttachment(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter without Shift
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 bg-white border-t border-gray-100 flex flex-col gap-2"
    >
      {/* File Preview Thumbnail */}
      {attachment && (
        <div className="relative inline-flex items-center w-max p-2 border border-gray-200 rounded-lg shadow-sm bg-gray-50 mb-1 max-w-[200px]">
          {attachment.contentType?.startsWith("video/") ? (
            <video src={attachment.url} className="h-12 w-12 object-cover rounded" />
          ) : (
            <img src={attachment.url} alt="preview" className="h-12 w-12 object-cover rounded" />
          )}
          <span className="text-xs text-gray-600 truncate ml-2 mr-6">{attachment.name}</span>
          <button
            type="button"
            onClick={handleRemoveAttachment}
            className="absolute top-1 right-1 p-0.5 rounded-full bg-white text-gray-500 hover:text-red-500 shadow"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex gap-2 items-end">
        <input 
           type="file" 
           accept="image/*,video/*" 
           className="hidden" 
           ref={fileInputRef} 
           onChange={handleFileChange} 
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled || isListening || isLoading}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full text-gray-500 hover:bg-gray-100 flex-shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasMessages ? "Type your message..." : placeholder}
          disabled={disabled}
          rows={1}
          className={`flex-1 resize-none rounded-3xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 max-h-[120px] overflow-y-auto ${
            !hasMessages ? "placeholder:animate-placeholder-fade" : ""
          }`}
        />
        <Button
          type={(input.trim() || attachment) ? "submit" : "button"}
          size="icon"
          variant={isListening ? "destructive" : "default"}
          disabled={disabled || isLoading}
          onClick={(input.trim() || attachment) ? undefined : handleVoiceClick}
          className="rounded-full relative transition-all flex-shrink-0"
        >
          {(input.trim() || attachment) ? (
            <Send className="h-4 w-4" />
          ) : isListening ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <AudioLines className="h-4 w-4" />
          )}

          {/* Red pulse indicator when connected */}
          {isListening && (!input.trim() && !attachment) && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}

          <span className="sr-only">
            {(input.trim() || attachment)
              ? "Send message"
              : isListening
              ? "Stop listening"
              : "Start listening"}
          </span>
        </Button>
      </div>
    </form>
  );
}

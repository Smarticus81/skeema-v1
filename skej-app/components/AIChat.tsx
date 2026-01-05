"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, Trash2, Settings2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Logo } from "./Logo";
import { api, getApiBaseUrl } from "@/lib/api";
import { CHAT_SYSTEM_INSTRUCTION, CHAT_TOOLS } from "@/lib/chat-tools";

const API_URL = getApiBaseUrl();

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Model {
  id: string;
  name: string;
  recommended?: boolean;
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-5-20250929");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: scheduleItems = [] } = useQuery({
    queryKey: ["schedule"],
    queryFn: api.getSchedule,
  });

  const { data: modelData } = useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/models`);
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json();
    },
  });

  const models: Model[] = modelData?.models || [
    { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", recommended: true },
    { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5 (Fast)" },
    { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet" },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateScheduleContext = () => {
    const today = new Date().toISOString().split("T")[0];
    const maxItems = 200;
    const shown = scheduleItems.slice(0, maxItems);
    return `
CURRENT SCHEDULE DATA (${scheduleItems.length} items):

DETAILED ITEMS:
${shown
  .map(
    (item) =>
      `${item.id} | ${item.product} | Class ${item.class} | ${item.type} | ${item.start || "—"} to ${item.end || "—"} | Due: ${item.due || "—"} | ${item.status} | Freq: ${item.frequency || "—"} | Writer: ${item.writer || "—"} | Combined: ${item.combined_psur || "—"} | Notes: ${item.notes ? item.notes.replace(/\s+/g, " ").slice(0, 240) : "—"}`
  )
  .join("\n")}

${scheduleItems.length > maxItems ? `\nNOTE: Context truncated to first ${maxItems} items for reliability.` : ""}

CURRENT DATE: ${today}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const scheduleContext = generateScheduleContext();
      const systemPrompt = CHAT_SYSTEM_INSTRUCTION + "\n\n" + scheduleContext;

      const response = await fetch(`${API_URL}/claude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 1024,
          temperature: 0.7,
          system: systemPrompt,
          messages: [...messages, { role: "user", content: userMessage }],
          tools: CHAT_TOOLS,
        }),
      });

      if (!response.ok) {
        let msg = "Failed to get response from AI";
        try {
          const errJson: any = await response.json();
          msg = errJson?.error?.message || errJson?.error || msg;
        } catch {
          try {
            const errText = await response.text();
            if (errText) msg = errText;
          } catch {
            // ignore
          }
        }
        throw new Error(msg);
      }

      const data = await response.json();
      let assistantMessage = "";

      if (data.content) {
        if (Array.isArray(data.content)) {
          assistantMessage = data.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n");
        } else {
          assistantMessage = data.content;
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantMessage || "I processed your request." },
      ]);
      
      // Refresh schedule data in case the AI made updates
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: error instanceof Error ? error.message : "Sorry, I encountered an error." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
  };

  return (
    <div className="h-full flex flex-col bg-background/60 backdrop-blur-sm border border-border/40 rounded-2xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-5 border-b border-border/40 flex items-center justify-between bg-background/40 relative">
        <div className="flex items-center gap-2">
          <Logo size="small" />
          <div className="relative">
            <button
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
            >
              {models.find(m => m.id === selectedModel)?.name || "Select Model"}
              <Settings2 className="w-3 h-3" />
            </button>
            
            {showModelSelector && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-background/95 backdrop-blur-md border border-border/40 rounded-xl shadow-lg p-1 z-50 overflow-hidden">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelSelector(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                      selectedModel === model.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {model.name}
                    {model.recommended && <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">Rec</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleClear}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          title="Clear chat"
        >
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div className="max-w-sm">
              <Logo size="default" className="justify-center mb-4 opacity-30" />
              <p className="text-muted-foreground text-sm">
                Ask me about your schedule, regulatory requirements, or to update items.
              </p>
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-muted px-4 py-3 rounded-2xl">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-5 border-t border-border/40 bg-background/40">
        <div className="flex gap-2 items-center bg-background border border-border/40 rounded-full px-4 py-2.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your schedule..."
            disabled={isLoading}
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}


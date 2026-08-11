import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, ChefHat, Loader2, Trash2, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import { aiApi, recipesApi } from "../utils/api";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import type { ChatMessage } from "../types";

const SUGGESTIONS = [
  "What can I cook with chicken and lemon?",
  "How do I make pasta from scratch?",
  "Tips for a fluffy omelette?",
  "Suggest a quick vegetarian dinner",
];

interface ThinkingBlockProps {
  content: string;
  done: boolean;
}

function ThinkingBlock({ content, done }: ThinkingBlockProps) {
  const [open, setOpen] = useState(true);

  // Auto-collapse once response is done
  useEffect(() => {
    if (done) setOpen(false);
  }, [done]);

  return (
    <div className="mb-2 rounded-2xl border border-purple-100 bg-purple-50 text-xs overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-purple-600 font-medium"
      >
        <span className="flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5" />
          {done ? "Thinking (collapsed)" : "Thinking…"}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="thinking-content"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <p className="px-3 pb-3 text-purple-700 whitespace-pre-wrap leading-relaxed">{content}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  // Streaming state for the in-progress assistant turn
  const [streamThinking, setStreamThinking] = useState("");
  const [streamContent, setStreamContent] = useState("");
  const [streamDone, setStreamDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamContent, streamThinking]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: msg };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);
    setStreamThinking("");
    setStreamContent("");
    setStreamDone(false);

    const token = localStorage.getItem("access_token");

    try {
      const resp = await fetch(aiApi.chatStreamUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg, history: messages }),
      });

      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let thinking = "";
      let content = "";
      let model = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const chunk = JSON.parse(raw);
            if (chunk.type === "thinking") {
              thinking += chunk.content;
              setStreamThinking(thinking);
            } else if (chunk.type === "token") {
              content += chunk.content;
              setStreamContent(content);
            } else if (chunk.type === "done") {
              model = chunk.model ?? "";
              setCurrentModel(model || null);
              setStreamDone(true);
            } else if (chunk.type === "error") {
              throw new Error(chunk.content);
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }

      // Commit finished message to history
      setMessages([
        ...history,
        { role: "assistant", content, thinking: thinking || undefined, model: model || undefined },
      ]);
      setStreamThinking("");
      setStreamContent("");
      setStreamDone(false);
    } catch (err) {
      toast.error("AI is unavailable — check the Ollama/OpenAI config.");
    } finally {
      setLoading(false);
    }
  };

  const generateAndSave = async () => {
    const prompt = messages[messages.length - 2]?.content ?? "";
    if (!prompt) { toast.error("No message to generate from"); return; }
    setGenerating(true);
    try {
      const { data } = await aiApi.generate(prompt, undefined, user?.unit_system ?? "metric");
      const res = await recipesApi.create({
        ...data,
        is_ai_generated: true,
        ai_model_used: data._ai_model ?? currentModel ?? null,
      });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Recipe saved!");
      navigate(`/recipes/${res.data.id}`);
    } catch {
      toast.error("Could not save recipe");
    } finally {
      setGenerating(false);
    }
  };

  const isStreaming = loading && (streamContent || streamThinking);

  return (
    <div className="flex flex-col h-dvh bg-cream">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-brand-100 px-4 py-3 flex items-center gap-3 safe-top">
        <div className="w-10 h-10 bg-brand-500 rounded-2xl flex items-center justify-center">
          <ChefHat className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-display font-bold text-gray-900">AI Chef</h1>
          <p className="text-xs text-gray-400">
            {currentModel ? `Powered by ${currentModel}` : "Powered by AI"}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setCurrentModel(null); }}
            className="ml-auto btn-ghost p-2 text-gray-400"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {messages.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-8"
          >
            <div className="text-5xl mb-4">👨‍🍳</div>
            <h2 className="font-display text-xl font-bold text-gray-800 mb-2">
              Hello! I'm your AI Chef
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Ask me for recipes, cooking tips, or ingredient substitutions!
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-4 py-3 rounded-2xl border border-brand-200 bg-white
                             text-gray-700 hover:bg-brand-50 hover:border-brand-400 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-brand-600" />
                </div>
              )}
              <div className="max-w-[80%] flex flex-col gap-1">
                {msg.role === "assistant" && msg.thinking && (
                  <ThinkingBlock content={msg.thinking} done={true} />
                )}
                <div
                  className={`rounded-3xl px-4 py-3 text-sm leading-relaxed
                    ${msg.role === "user"
                      ? "bg-brand-500 text-white rounded-br-sm"
                      : "bg-white text-gray-800 shadow-card rounded-bl-sm"
                    }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === "assistant" && msg.model && (
                    <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                      <Bot className="w-3 h-3" /> {msg.model}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Live streaming bubble */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-brand-600" />
            </div>
            <div className="max-w-[80%] flex flex-col gap-1">
              {streamThinking && (
                <ThinkingBlock content={streamThinking} done={streamDone} />
              )}
              <div className="bg-white rounded-3xl rounded-bl-sm px-4 py-3 shadow-card text-sm leading-relaxed text-gray-800">
                {isStreaming ? (
                  <p className="whitespace-pre-wrap">{streamContent}<span className="inline-block w-1.5 h-4 bg-brand-400 animate-pulse ml-0.5 rounded-sm" /></p>
                ) : (
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-brand-300"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Save as recipe button */}
        {messages.length >= 2 && messages[messages.length - 1].role === "assistant" && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
            <button
              onClick={generateAndSave}
              disabled={generating}
              className="btn-secondary text-xs"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Generate & Save as Recipe
            </button>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="fixed bottom-16 inset-x-0 bg-white/90 backdrop-blur-md border-t border-brand-100 px-4 py-3 safe-bottom">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex gap-2 mx-auto max-w-lg"
        >
          <input
            className="input-field flex-1"
            placeholder="Ask anything about cooking…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            className="w-12 h-12 bg-brand-500 rounded-2xl flex items-center justify-center
                       text-white hover:bg-brand-600 active:scale-95 transition-all shrink-0"
            disabled={loading || !input.trim()}
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

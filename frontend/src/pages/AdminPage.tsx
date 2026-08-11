import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, MailOpen, ToggleLeft, ToggleRight,
  KeyRound, X, Loader2, ShieldCheck, ChevronDown, ChevronUp,
  Bot, Save, Eye, EyeOff, RefreshCw, FileText, RotateCcw,
  MessageSquare, Search, ScanLine, Wand2, Link,
} from "lucide-react";
import toast from "react-hot-toast";
import { usersApi, authApi, adminApi } from "../utils/api";
import type { User, SignupRequest } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Provider = "ollama" | "openai" | "anthropic" | "paddle";

interface AISettingsOut {
  ollama_base_url: string;
  openai_api_key_set: boolean;
  openai_api_key_preview: string;
  anthropic_api_key_set: boolean;
  anthropic_api_key_preview: string;
  chat_provider: Provider;
  chat_model: string;
  embedding_provider: Provider;
  embedding_model: string;
  ocr_vision_provider: Provider;
  ocr_vision_model: string;
  ocr_structure_provider: Provider;
  ocr_structure_model: string;
}

interface AISettingsForm {
  ollama_base_url: string;
  openai_api_key: string;       // blank = don't update
  anthropic_api_key: string;    // blank = don't update
  chat_provider: Provider;
  chat_model: string;
  embedding_provider: Provider;
  embedding_model: string;
  ocr_vision_provider: Provider;
  ocr_vision_model: string;
  ocr_structure_provider: Provider;
  ocr_structure_model: string;
}

interface PromptsForm {
  prompt_recipe_generate: string;
  prompt_chat_system: string;
  prompt_ocr_vision: string;
  prompt_ocr_structure: string;
  prompt_url_import: string;
}

// ── Role config ────────────────────────────────────────────────────────────────

const ROLES = [
  {
    key: "chat" as const,
    label: "Chat & Generation",
    description: "Recipe generation, AI chat, URL import",
    icon: MessageSquare,
    providers: ["ollama", "openai", "anthropic"] as Provider[],
    placeholders: { ollama: "llama3.2", openai: "gpt-4o-mini", anthropic: "claude-haiku-4-5-20251001" },
  },
  {
    key: "embedding" as const,
    label: "Embeddings & Search",
    description: "Semantic recipe search",
    icon: Search,
    providers: ["ollama", "openai"] as Provider[],
    placeholders: { ollama: "llama3.2", openai: "text-embedding-3-small", anthropic: "" },
  },
  {
    key: "ocr_vision" as const,
    label: "OCR Vision",
    description: "Step 1: image → plain text",
    icon: ScanLine,
    providers: ["ollama", "openai", "anthropic", "paddle"] as Provider[],
    placeholders: { ollama: "qwen3-vl", openai: "gpt-4o", anthropic: "claude-haiku-4-5-20251001", paddle: "en  (optional language override, e.g. german)" },
  },
  {
    key: "ocr_structure" as const,
    label: "OCR Structuring",
    description: "Step 2: plain text → recipe JSON",
    icon: Wand2,
    providers: ["ollama", "openai", "anthropic"] as Provider[],
    placeholders: { ollama: "llama3.2", openai: "gpt-4o-mini", anthropic: "claude-haiku-4-5-20251001" },
  },
] as const;

const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "Ollama",
  openai: "OpenAI",
  anthropic: "Anthropic",
  paddle: "PaddleOCR",
};

const PROMPT_META: { key: keyof PromptsForm; label: string; icon: React.FC<any>; hint: string }[] = [
  { key: "prompt_recipe_generate", label: "Recipe Generation", icon: Wand2, hint: "Placeholders: {prompt}, {servings}, {unit_system}" },
  { key: "prompt_chat_system", label: "AI Chef System Prompt", icon: MessageSquare, hint: "No placeholders — plain system instruction" },
  { key: "prompt_ocr_vision", label: "OCR Vision (Image → Text)", icon: ScanLine, hint: "Placeholder: {language}" },
  { key: "prompt_ocr_structure", label: "OCR Structuring (Text → JSON)", icon: Wand2, hint: "Placeholder: {extracted_text}" },
  { key: "prompt_url_import", label: "URL Import", icon: Link, hint: "Placeholder: {page_text}" },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const qc = useQueryClient();

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "user" });
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [showUsers, setShowUsers] = useState(true);
  const [showRequests, setShowRequests] = useState(true);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);

  const [aiForm, setAiForm] = useState<AISettingsForm | null>(null);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);

  const [promptsForm, setPromptsForm] = useState<PromptsForm | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<keyof PromptsForm | null>(null);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: async () => { const { data } = await usersApi.list(); return data; },
  });

  const { data: requests = [] } = useQuery<SignupRequest[]>({
    queryKey: ["signup-requests"],
    queryFn: async () => { const { data } = await usersApi.listSignupRequests(); return data; },
  });

  const { data: aiSettings } = useQuery<AISettingsOut>({
    queryKey: ["ai-settings"],
    queryFn: async () => { const { data } = await adminApi.getSettings(); return data; },
  });

  const { data: promptsData } = useQuery<PromptsForm>({
    queryKey: ["admin-prompts"],
    queryFn: async () => { const { data } = await adminApi.getPrompts(); return data; },
  });

  useEffect(() => {
    if (promptsData && !promptsForm) setPromptsForm(promptsData);
  }, [promptsData]);

  useEffect(() => {
    if (aiSettings && !aiForm) {
      setAiForm({
        ollama_base_url: aiSettings.ollama_base_url,
        openai_api_key: "",
        anthropic_api_key: "",
        chat_provider: aiSettings.chat_provider,
        chat_model: aiSettings.chat_model,
        embedding_provider: aiSettings.embedding_provider,
        embedding_model: aiSettings.embedding_model,
        ocr_vision_provider: aiSettings.ocr_vision_provider,
        ocr_vision_model: aiSettings.ocr_vision_model,
        ocr_structure_provider: aiSettings.ocr_structure_provider,
        ocr_structure_model: aiSettings.ocr_structure_model,
      });
    }
  }, [aiSettings]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createUserMutation = useMutation({
    mutationFn: () => usersApi.create(newUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`User ${newUser.username} created`);
      setShowAddUser(false);
      setNewUser({ username: "", email: "", password: "", role: "user" });
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? "Failed to create user"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: string) => usersApi.toggleActivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("User status updated"); },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => authApi.resetPassword(resetTarget!.id, newPassword),
    onSuccess: () => { toast.success("Password reset!"); setResetTarget(null); setNewPassword(""); },
    onError: () => toast.error("Failed to reset password"),
  });

  const approveRequestMutation = useMutation({
    mutationFn: (id: string) => usersApi.approveSignupRequest(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["signup-requests"] }); toast.success("Request approved"); },
  });

  const saveAISettingsMutation = useMutation({
    mutationFn: (data: AISettingsForm) => adminApi.updateSettings(data),
    onSuccess: ({ data }: { data: AISettingsOut }) => {
      setAiForm((f) => f ? {
        ...f,
        ollama_base_url: data.ollama_base_url,
        openai_api_key: "",
        anthropic_api_key: "",
        chat_provider: data.chat_provider,
        chat_model: data.chat_model,
        embedding_provider: data.embedding_provider,
        embedding_model: data.embedding_model,
        ocr_vision_provider: data.ocr_vision_provider,
        ocr_vision_model: data.ocr_vision_model,
        ocr_structure_provider: data.ocr_structure_provider,
        ocr_structure_model: data.ocr_structure_model,
      } : f);
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
      toast.success("AI settings saved");
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const reindexMutation = useMutation({
    mutationFn: () => adminApi.reindexAll(),
    onSuccess: ({ data }: { data: { queued: number } }) =>
      toast.success(`Re-indexing ${data.queued} recipes in the background`),
    onError: () => toast.error("Re-index failed"),
  });

  const savePromptsMutation = useMutation({
    mutationFn: (data: PromptsForm) => adminApi.updatePrompts(data),
    onSuccess: ({ data }: { data: PromptsForm }) => {
      setPromptsForm(data);
      qc.invalidateQueries({ queryKey: ["admin-prompts"] });
      toast.success("Prompts saved");
    },
    onError: () => toast.error("Failed to save prompts"),
  });

  const resetPromptMutation = useMutation({
    mutationFn: (key: keyof PromptsForm) => adminApi.resetPrompt(key),
    onSuccess: ({ data }: { data: PromptsForm }) => {
      setPromptsForm(data);
      qc.invalidateQueries({ queryKey: ["admin-prompts"] });
      toast.success("Prompt reset to default");
    },
    onError: () => toast.error("Failed to reset prompt"),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const pendingRequests = requests.filter((r: SignupRequest) => r.status === "pending");

  const setAiField = <K extends keyof AISettingsForm>(key: K, value: AISettingsForm[K]) =>
    setAiForm((f) => f ? { ...f, [key]: value } : f);

  const setPromptField = (key: keyof PromptsForm, value: string) =>
    setPromptsForm((f) => f ? { ...f, [key]: value } : f);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-7 h-7 text-brand-500" />
        <h1 className="font-display text-2xl font-bold text-gray-900">Admin Panel</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-brand-500">{users.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Users</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-brand-500">{pendingRequests.length}</p>
          <p className="text-xs text-gray-500 mt-1">Pending Requests</p>
        </div>
      </div>

      {/* Add user */}
      <button onClick={() => setShowAddUser((v) => !v)} className="btn-primary w-full mb-4">
        <UserPlus className="w-4 h-4" /> Add New User
      </button>
      <AnimatePresence>
        {showAddUser && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="card p-4 mb-6 overflow-hidden"
          >
            <h3 className="font-semibold text-gray-800 mb-3">New User</h3>
            <div className="space-y-3">
              <input className="input-field" placeholder="Username" value={newUser.username}
                onChange={(e) => setNewUser((v) => ({ ...v, username: e.target.value }))} />
              <input type="email" className="input-field" placeholder="Email" value={newUser.email}
                onChange={(e) => setNewUser((v) => ({ ...v, email: e.target.value }))} />
              <input type="password" className="input-field" placeholder="Temporary password" value={newUser.password}
                onChange={(e) => setNewUser((v) => ({ ...v, password: e.target.value }))} />
              <select className="input-field" value={newUser.role}
                onChange={(e) => setNewUser((v) => ({ ...v, role: e.target.value }))}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <div className="flex gap-2">
                <button onClick={() => createUserMutation.mutate()} className="btn-primary flex-1"
                  disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create
                </button>
                <button onClick={() => setShowAddUser(false)} className="btn-ghost flex-1">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users list */}
      <div className="card mb-4">
        <button onClick={() => setShowUsers((v) => !v)} className="w-full flex items-center justify-between p-4">
          <span className="flex items-center gap-2 font-semibold text-gray-800">
            <Users className="w-4 h-4 text-brand-500" /> Users ({users.length})
          </span>
          {showUsers ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        <AnimatePresence>
          {showUsers && (
            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                    <span className="text-brand-600 text-sm font-bold">{u.username[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.username}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setResetTarget(u); setNewPassword(""); }}
                      className="btn-ghost p-1.5 text-gray-400" title="Reset password">
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleActiveMutation.mutate(u.id)}
                      className={`btn-ghost p-1.5 ${u.is_active ? "text-sage-500" : "text-red-400"}`}
                      title={u.is_active ? "Deactivate" : "Activate"}>
                      {u.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Signup requests */}
      {pendingRequests.length > 0 && (
        <div className="card mb-4">
          <button onClick={() => setShowRequests((v) => !v)} className="w-full flex items-center justify-between p-4">
            <span className="flex items-center gap-2 font-semibold text-gray-800">
              <MailOpen className="w-4 h-4 text-brand-500" /> Signup Requests ({pendingRequests.length})
            </span>
            {showRequests ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
          <AnimatePresence>
            {showRequests && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="px-4 py-3 border-t border-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{req.username}</p>
                        <p className="text-xs text-gray-400">{req.email}</p>
                        {req.message && <p className="text-xs text-gray-500 mt-1 italic">"{req.message}"</p>}
                      </div>
                      <button onClick={() => approveRequestMutation.mutate(req.id)}
                        className="badge bg-sage-100 text-sage-700 shrink-0 px-3 py-1">
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── AI Settings ────────────────────────────────────────────────────────── */}
      <div className="card mb-4">
        <button onClick={() => setShowAISettings((v) => !v)} className="w-full flex items-center justify-between p-4">
          <span className="flex items-center gap-2 font-semibold text-gray-800">
            <Bot className="w-4 h-4 text-brand-500" /> AI Settings
          </span>
          {showAISettings ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        <AnimatePresence>
          {showAISettings && aiForm && (
            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="px-4 pb-5 border-t border-gray-50 pt-4 space-y-6">

                {/* ── Credentials ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Provider Credentials</p>
                  <div className="space-y-3">

                    {/* Ollama Base URL */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Ollama Base URL</label>
                      <input className="input-field font-mono text-sm"
                        placeholder="http://192.168.1.x:11434"
                        value={aiForm.ollama_base_url}
                        onChange={(e) => setAiField("ollama_base_url", e.target.value)} />
                      <p className="text-xs text-gray-400 mt-1">Used by all roles configured with Ollama</p>
                    </div>

                    {/* OpenAI API Key */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">OpenAI API Key</label>
                      <div className="relative">
                        <input
                          type={showOpenAIKey ? "text" : "password"}
                          className="input-field font-mono text-sm pr-10"
                          placeholder={aiSettings?.openai_api_key_set
                            ? `Current: ${aiSettings.openai_api_key_preview} — leave blank to keep`
                            : "sk-..."}
                          value={aiForm.openai_api_key}
                          onChange={(e) => setAiField("openai_api_key", e.target.value)}
                          autoComplete="off"
                        />
                        <button type="button" onClick={() => setShowOpenAIKey((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                          {showOpenAIKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {aiSettings?.openai_api_key_set && (
                        <p className="text-xs text-sage-600 mt-1">Key saved: {aiSettings.openai_api_key_preview}. Enter a new key to replace.</p>
                      )}
                    </div>

                    {/* Anthropic API Key */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Anthropic API Key</label>
                      <div className="relative">
                        <input
                          type={showAnthropicKey ? "text" : "password"}
                          className="input-field font-mono text-sm pr-10"
                          placeholder={aiSettings?.anthropic_api_key_set
                            ? `Current: ${aiSettings.anthropic_api_key_preview} — leave blank to keep`
                            : "sk-ant-..."}
                          value={aiForm.anthropic_api_key}
                          onChange={(e) => setAiField("anthropic_api_key", e.target.value)}
                          autoComplete="off"
                        />
                        <button type="button" onClick={() => setShowAnthropicKey((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                          {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {aiSettings?.anthropic_api_key_set && (
                        <p className="text-xs text-sage-600 mt-1">Key saved: {aiSettings.anthropic_api_key_preview}. Enter a new key to replace.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Per-role config ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Role Configuration</p>
                  <div className="space-y-3">
                    {ROLES.map((role) => {
                      const providerKey = `${role.key}_provider` as keyof AISettingsForm;
                      const modelKey = `${role.key}_model` as keyof AISettingsForm;
                      const currentProvider = aiForm[providerKey] as Provider;
                      const currentModel = aiForm[modelKey] as string;
                      const Icon = role.icon;

                      return (
                        <div key={role.key} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 space-y-2.5">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-gray-700">{role.label}</p>
                              <p className="text-xs text-gray-400">{role.description}</p>
                            </div>
                          </div>

                          {/* Provider toggle */}
                          <div className="flex gap-1.5">
                            {role.providers.map((p) => (
                              <button key={p} type="button"
                                onClick={() => setAiField(providerKey, p)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all
                                  ${currentProvider === p
                                    ? "bg-brand-500 text-white border-brand-500"
                                    : "bg-white text-gray-500 border-gray-200 hover:border-brand-300"
                                  }`}
                              >
                                {PROVIDER_LABELS[p]}
                              </button>
                            ))}
                          </div>

                          {/* Model input */}
                          <input
                            className="input-field font-mono text-xs py-2"
                            placeholder={`Model name — e.g. ${role.placeholders[currentProvider] || "model-name"}`}
                            value={currentModel}
                            onChange={(e) => setAiField(modelKey, e.target.value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Save + Re-index */}
                <button type="button" onClick={() => aiForm && saveAISettingsMutation.mutate(aiForm)}
                  className="btn-primary w-full" disabled={saveAISettingsMutation.isPending}>
                  {saveAISettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save AI Settings
                </button>
                <button type="button" onClick={() => reindexMutation.mutate()}
                  className="btn-ghost w-full border border-gray-200" disabled={reindexMutation.isPending}
                  title="Re-generate embeddings for all recipes — run after changing the embedding model">
                  {reindexMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Re-index All Recipes
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── AI Prompts ─────────────────────────────────────────────────────────── */}
      <div className="card mb-4">
        <button onClick={() => setShowPrompts((v) => !v)} className="w-full flex items-center justify-between p-4">
          <span className="flex items-center gap-2 font-semibold text-gray-800">
            <FileText className="w-4 h-4 text-brand-500" /> AI Prompts
          </span>
          {showPrompts ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        <AnimatePresence>
          {showPrompts && promptsForm && (
            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="px-4 pb-5 border-t border-gray-50 pt-4 space-y-3">
                <p className="text-xs text-gray-400">
                  Prompts are loaded from the database first; delete an override to revert to the built-in default.
                </p>

                {PROMPT_META.map(({ key, label, icon: Icon, hint }) => {
                  const isOpen = expandedPrompt === key;
                  return (
                    <div key={key} className="rounded-2xl border border-gray-100 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedPrompt(isOpen ? null : key)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50/60 hover:bg-gray-100/60 transition-colors"
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                          <Icon className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                          {label}
                        </span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 pt-2 space-y-2">
                              <p className="text-xs text-gray-400 font-mono">{hint}</p>
                              <textarea
                                className="input-field font-mono text-xs leading-relaxed resize-y w-full"
                                rows={8}
                                value={promptsForm[key]}
                                onChange={(e) => setPromptField(key, e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => resetPromptMutation.mutate(key)}
                                className="btn-ghost text-xs text-gray-400 border border-gray-200 w-full"
                                disabled={resetPromptMutation.isPending}
                              >
                                <RotateCcw className="w-3 h-3" /> Reset to default
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                <button type="button"
                  onClick={() => promptsForm && savePromptsMutation.mutate(promptsForm)}
                  className="btn-primary w-full" disabled={savePromptsMutation.isPending}>
                  {savePromptsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save All Prompts
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Password reset modal */}
      <AnimatePresence>
        {resetTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end p-4"
            onClick={(e) => e.target === e.currentTarget && setResetTarget(null)}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="card w-full max-w-lg mx-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold">Reset Password</h3>
                <button onClick={() => setResetTarget(null)} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">Set a new password for <strong>{resetTarget.username}</strong></p>
              <input type="password" className="input-field mb-3" placeholder="New password"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <button onClick={() => resetPasswordMutation.mutate()} className="btn-primary w-full"
                disabled={!newPassword || resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Reset Password
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

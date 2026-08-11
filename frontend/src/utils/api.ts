import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from "axios";

const api = axios.create({ baseURL: "/api/v1" });

// Attach token from localStorage
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.data) console.debug("[api] →", config.method?.toUpperCase(), config.url, config.data);
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (r: AxiosResponse) => r,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status === 401 && !original?._retry) {
      if (original) original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post("/api/v1/auth/refresh", {
            refresh_token: refresh,
          });
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);
          if (original) original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original!);
        } catch {
          localStorage.clear();
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string, totp_code?: string) =>
    api.post("/auth/login", { username, password, totp_code }),
  setupTotp: () => api.post("/auth/totp/setup"),
  verifyTotp: (code: string) => api.post("/auth/totp/verify", { code }),
  disableTotp: (code: string) => api.post("/auth/totp/disable", { code }),
  resetPassword: (user_id: string, new_password: string) =>
    api.post("/auth/reset-password", { user_id, new_password }),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  me: () => api.get("/users/me"),
  updateMe: (data: object) => api.patch("/users/me", data),
  list: () => api.get("/users/"),
  create: (data: object) => api.post("/users/", data),
  toggleActivate: (id: string) => api.patch(`/users/${id}/activate`),
  signupRequest: (data: object) => api.post("/users/signup-request", data),
  listSignupRequests: () => api.get("/users/signup-requests"),
  approveSignupRequest: (id: string) =>
    api.patch(`/users/signup-requests/${id}/approve`),
  getNewShares: () => api.get("/users/me/new-shares"),
  markSharesSeen: () => api.post("/users/me/shares/seen"),
};

// ── Recipes ───────────────────────────────────────────────────────────────────
export const recipesApi = {
  list: (params?: object) => api.get("/recipes/", { params }),
  get: (id: string, unit_system?: string) =>
    api.get(`/recipes/${id}`, { params: unit_system ? { unit_system } : {} }),
  create: (data: object) => api.post("/recipes/", data),
  update: (id: string, data: object) => api.patch(`/recipes/${id}`, data),
  delete: (id: string) => api.delete(`/recipes/${id}`),
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/recipes/${id}/image`, form);
  },
  share: (id: string, data: object) => api.post(`/recipes/${id}/share`, data),
  revokeShare: (id: string, shareId: string) =>
    api.delete(`/recipes/${id}/share/${shareId}`),
  favorite: (id: string) => api.post(`/recipes/${id}/favorite`),
  unfavorite: (id: string) => api.delete(`/recipes/${id}/favorite`),
};

// ── OCR ───────────────────────────────────────────────────────────────────────
export const ocrApi = {
  extract: (file: File, language = "eng") => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/ocr/extract?language=${language}`, form);
  },
  extractBackground: (file: File, language = "eng") => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/ocr/extract-background?language=${language}`, form);
  },
  getTask: (taskId: string) => api.get(`/ocr/task/${taskId}`),
};

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiApi = {
  search: (query: string) => api.post("/ai/search", { query }),
  generate: (prompt: string, servings?: number, unit_system = "metric") =>
    api.post("/ai/generate", { prompt, servings, unit_system }),
  importUrl: (url: string) => api.post("/ai/import-url", { url }),
  importUrlStatus: (taskId: string) => api.get(`/ai/import-url/status/${taskId}`),
  chat: (message: string, history: object[]) =>
    api.post("/ai/chat", { message, history }),
  chatStreamUrl: () => "/api/v1/ai/chat/stream",
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  getSettings: () => api.get("/admin/settings"),
  updateSettings: (data: object) => api.put("/admin/settings", data),
  reindexAll: () => api.post("/admin/reindex"),
  getPrompts: () => api.get("/admin/prompts"),
  updatePrompts: (data: object) => api.put("/admin/prompts", data),
  resetPrompt: (key: string) => api.delete(`/admin/prompts/${key}`),
};

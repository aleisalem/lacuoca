import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChefHat, Eye, EyeOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { authApi, usersApi } from "../utils/api";
import { useAuthStore } from "../store/authStore";

type Mode = "login" | "signup-request";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [reqPassword, setReqPassword] = useState("");
  const [reqPasswordConfirm, setReqPasswordConfirm] = useState("");
  const [showReqPw, setShowReqPw] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.login(username, password, totpCode || undefined);

      if (data.requires_totp) {
        setRequiresTotp(true);
        toast("Please enter your 2FA code", { icon: "🔐" });
        return;
      }

      // Store token first so the axios interceptor sends it with the /me request
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      const meRes = await usersApi.me();
      setAuth(meRes.data, data.access_token, data.refresh_token);
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignupRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reqPassword !== reqPasswordConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (reqPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await usersApi.signupRequest({ username, email, password: reqPassword, message });
      toast.success("Request sent! You'll be able to log in once an admin approves it.");
      setMode("login");
      setReqPassword("");
      setReqPasswordConfirm("");
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Failed to send request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-50 via-cream to-orange-50 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center mb-8"
      >
        <div className="w-20 h-20 bg-brand-500 rounded-3xl flex items-center justify-center shadow-lg mb-4">
          <ChefHat className="w-10 h-10 text-white" />
        </div>
        <h1 className="font-display text-3xl font-bold text-gray-900">LaCuoca</h1>
        <p className="text-sm text-gray-500 mt-1">Your personal recipe collection</p>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="card w-full max-w-sm p-6"
      >
        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
          {(["login", "signup-request"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setRequiresTotp(false); }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                mode === m ? "bg-white shadow text-brand-600" : "text-gray-500"
              }`}
            >
              {m === "login" ? "Sign In" : "Request Access"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {mode === "login" ? (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleLogin}
              className="space-y-4"
            >
              {!requiresTotp ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
                    <input
                      className="input-field"
                      placeholder="your_username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                    <div className="relative">
                      <input
                        type={showPw ? "text" : "password"}
                        className="input-field pr-11"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Two-Factor Code
                  </label>
                  <input
                    className="input-field text-center text-2xl tracking-widest"
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </motion.div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {requiresTotp ? "Verify" : "Sign In"}
              </button>

              {requiresTotp && (
                <button
                  type="button"
                  onClick={() => setRequiresTotp(false)}
                  className="btn-ghost w-full text-xs"
                >
                  Back to login
                </button>
              )}
            </motion.form>
          ) : (
            <motion.form
              key="signup"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={handleSignupRequest}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
                <input className="input-field" placeholder="your_username" value={username}
                  onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" className="input-field" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Choose a password</label>
                <div className="relative">
                  <input
                    type={showReqPw ? "text" : "password"}
                    className="input-field pr-11"
                    placeholder="At least 8 characters"
                    value={reqPassword}
                    onChange={(e) => setReqPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowReqPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showReqPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Confirm password</label>
                <input
                  type={showReqPw ? "text" : "password"}
                  className={`input-field ${
                    reqPasswordConfirm && reqPassword !== reqPasswordConfirm
                      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                      : ""
                  }`}
                  placeholder="Repeat your password"
                  value={reqPasswordConfirm}
                  onChange={(e) => setReqPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {reqPasswordConfirm && reqPassword !== reqPasswordConfirm && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Message (optional)</label>
                <textarea className="input-field resize-none h-16" placeholder="Hi! I'd love to join..." value={message}
                  onChange={(e) => setMessage(e.target.value)} />
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading || (!!reqPasswordConfirm && reqPassword !== reqPasswordConfirm)}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Request
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>

      <p className="mt-6 text-xs text-gray-400">
        LaCuoca — for family &amp; friends 🍴
      </p>
    </div>
  );
}

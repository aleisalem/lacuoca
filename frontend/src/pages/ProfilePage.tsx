import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  User, Shield, Scale, LogOut, ChevronRight,
  Loader2, QrCode, Trash2, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { authApi, usersApi } from "../utils/api";
import { useAuthStore } from "../store/authStore";
import type { UnitSystem } from "../types";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const [showTotp, setShowTotp] = useState<"setup" | "disable" | null>(null);
  const [totpData, setTotpData] = useState<{ qr_data_url: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const updateMutation = useMutation({
    mutationFn: (data: object) => usersApi.updateMe(data),
    onSuccess: (res) => {
      setUser(res.data);
      toast.success("Preferences saved");
    },
    onError: () => toast.error("Failed to update"),
  });

  const handleUnitChange = (unit_system: UnitSystem) => {
    updateMutation.mutate({ unit_system });
  };

  const handleSetupTotp = async () => {
    try {
      const { data } = await authApi.setupTotp();
      setTotpData(data);
      setShowTotp("setup");
    } catch {
      toast.error("Failed to setup 2FA");
    }
  };

  const handleVerifyTotp = async () => {
    try {
      if (showTotp === "setup") {
        await authApi.verifyTotp(totpCode);
        setUser({ ...user!, totp_enabled: true });
        toast.success("2FA enabled!");
      } else {
        await authApi.disableTotp(totpCode);
        setUser({ ...user!, totp_enabled: false });
        toast.success("2FA disabled");
      }
      setShowTotp(null);
      setTotpCode("");
    } catch {
      toast.error("Invalid code — try again");
    }
  };

  if (!user) return null;

  return (
    <div className="page-container">
      {/* Avatar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center mb-8"
      >
        <div className="w-20 h-20 bg-gradient-to-br from-brand-400 to-orange-300 rounded-3xl flex items-center justify-center shadow-lg mb-3">
          <User className="w-10 h-10 text-white" />
        </div>
        <h1 className="font-display text-2xl font-bold text-gray-900">{user.username}</h1>
        <p className="text-sm text-gray-400">{user.email}</p>
        <span className={`badge mt-2 ${user.role === "admin" ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-600"}`}>
          {user.role}
        </span>
      </motion.div>

      {/* Unit system */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <Scale className="w-5 h-5 text-brand-500" />
          <h2 className="font-semibold text-gray-800">Preferred Units</h2>
        </div>
        <div className="flex gap-2">
          {(["metric", "imperial"] as UnitSystem[]).map((u) => (
            <button
              key={u}
              onClick={() => handleUnitChange(u)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all
                ${user.unit_system === u
                  ? "bg-brand-500 text-white border-brand-500"
                  : "bg-white text-gray-600 border-gray-200 hover:border-brand-300"
                }`}
            >
              {u === "metric" ? "🌍 Metric" : "🇺🇸 Imperial"}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Recipes will automatically convert units when you open them.
        </p>
      </div>

      {/* 2FA */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-5 h-5 text-brand-500" />
          <h2 className="font-semibold text-gray-800">Two-Factor Auth</h2>
          <span className={`badge ml-auto ${user.totp_enabled ? "bg-sage-100 text-sage-700" : "bg-gray-100 text-gray-500"}`}>
            {user.totp_enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {showTotp === "setup" && totpData ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
            <div className="flex justify-center">
              <img src={totpData.qr_data_url} alt="QR code" className="w-44 h-44 rounded-xl" />
            </div>
            <p className="text-xs text-gray-400 text-center break-all">
              Manual key: {totpData.secret}
            </p>
            <input
              className="input-field text-center text-xl tracking-widest"
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
            />
            <div className="flex gap-2">
              <button onClick={handleVerifyTotp} className="btn-primary flex-1">
                <Check className="w-4 h-4" /> Confirm
              </button>
              <button onClick={() => setShowTotp(null)} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        ) : showTotp === "disable" ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Enter your current 2FA code to disable it.</p>
            <input
              className="input-field text-center text-xl tracking-widest"
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
            />
            <div className="flex gap-2">
              <button onClick={handleVerifyTotp} className="btn-primary flex-1 bg-red-500 hover:bg-red-600">
                <Trash2 className="w-4 h-4" /> Disable 2FA
              </button>
              <button onClick={() => setShowTotp(null)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={user.totp_enabled ? () => setShowTotp("disable") : handleSetupTotp}
            className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all
              ${user.totp_enabled
                ? "border-red-200 text-red-500 hover:bg-red-50"
                : "border-brand-200 text-brand-600 hover:bg-brand-50"
              }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {user.totp_enabled ? (
                <><Trash2 className="w-4 h-4" /> Disable 2FA</>
              ) : (
                <><QrCode className="w-4 h-4" /> Enable 2FA</>
              )}
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={() => { logout(); window.location.href = "/login"; }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                   bg-red-50 text-red-500 border border-red-200 font-medium text-sm
                   hover:bg-red-100 transition-colors active:scale-95"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
}

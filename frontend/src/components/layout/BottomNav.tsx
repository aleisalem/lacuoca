import { NavLink } from "react-router-dom";
import { Home, Bot, User, ShieldCheck, Heart } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "../../store/authStore";

const navItems = [
  { to: "/", icon: Home, label: "Recipes" },
  { to: "/favorites", icon: Heart, label: "Favorites" },
  { to: "/ai", icon: Bot, label: "AI Chef" },
  { to: "/profile", icon: User, label: "Profile" },
];

export default function BottomNav() {
  const isAdmin = useAuthStore((s) => s.isAdmin());

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-md border-t border-brand-100 safe-bottom">
      <div className="mx-auto max-w-lg flex items-center justify-around px-2 h-16">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-colors
               ${isActive ? "text-brand-600" : "text-gray-400"}`
            }
          >
            {({ isActive }) => (
              <>
                <motion.span
                  animate={{ scale: isActive ? 1.2 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 1.8} />
                </motion.span>
                <span className="text-[10px] font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-colors
               ${isActive ? "text-brand-600" : "text-gray-400"}`
            }
          >
            {({ isActive }) => (
              <>
                <motion.span
                  animate={{ scale: isActive ? 1.2 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <ShieldCheck className="w-6 h-6" strokeWidth={isActive ? 2.5 : 1.8} />
                </motion.span>
                <span className="text-[10px] font-medium">Admin</span>
              </>
            )}
          </NavLink>
        )}
      </div>
    </nav>
  );
}

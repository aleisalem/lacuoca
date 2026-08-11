import { Link } from "react-router-dom";
import { ChefHat } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

export default function Navbar() {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-brand-100 safe-top">
      <div className="mx-auto max-w-lg px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold text-brand-600">
          <ChefHat className="w-6 h-6" />
          LaCuoca
        </Link>
        <span className="text-xs font-medium text-gray-400">
          {user?.username}
        </span>
      </div>
    </header>
  );
}

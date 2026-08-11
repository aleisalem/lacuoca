import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Bot, X, Share2 } from "lucide-react";
import { recipesApi, aiApi, usersApi } from "../utils/api";
import { useAuthStore } from "../store/authStore";
import RecipeCard from "../components/recipes/RecipeCard";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import type { RecipeListItem, RecipeCategory, NewShareNotification } from "../types";


const CATEGORIES: RecipeCategory[] = [
  "breakfast", "lunch", "dinner", "dessert", "snack", "drink", "soup", "salad", "bread", "other",
];

const CATEGORY_EMOJI: Record<string, string> = {
  breakfast: "🍳", lunch: "🥗", dinner: "🍽️", dessert: "🍰",
  snack: "🍿", drink: "🥤", soup: "🍲", salad: "🥙", bread: "🍞", other: "🍴",
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<RecipeCategory | "">("");
  const [aiSearch, setAiSearch] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<any[]>([]);
  const [aiSearched, setAiSearched] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // IDs dismissed in this session — persists across refetches, resets only on full page reload
  const dismissedIds = useRef<Set<string>>(new Set());

  const { data: newShares = [] } = useQuery<NewShareNotification[]>({
    queryKey: ["new-shares"],
    queryFn: async () => {
      const { data } = await usersApi.getNewShares();
      return data;
    },
    staleTime: 0,
  });

  const dismissSharesMutation = useMutation({
    mutationFn: () => usersApi.markSharesSeen(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["new-shares"] }),
  });

  // Filter out any shares the user already dismissed this session
  const visibleShares = newShares.filter((n) => !dismissedIds.current.has(n.share_id));

  const handleDismissShares = () => {
    newShares.forEach((n) => dismissedIds.current.add(n.share_id));
    dismissSharesMutation.mutate();
  };

  const { data: recipes = [], isLoading } = useQuery<RecipeListItem[]>({
    queryKey: ["recipes", search, category],
    queryFn: async () => {
      const { data } = await recipesApi.list({
        ...(search ? { search } : {}),
        ...(category ? { category } : {}),
      });
      return data;
    },
  });

  const handleAiSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await aiApi.search(aiQuery);
      setAiResults(data.results);
      setAiSearched(true);
    } catch {
      setAiResults([]);
      setAiSearched(true);
    } finally {
      setAiLoading(false);
    }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-500">{greeting()},</p>
        <h1 className="font-display text-2xl font-bold text-gray-900">
          {user?.username} 👋
        </h1>
      </div>

      {/* New-share notification banner */}
      <AnimatePresence>
        {visibleShares.length > 0 && (
          <motion.div
            key="share-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 rounded-2xl border border-brand-100 bg-brand-50 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Share2 className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-800 mb-1">
                    {visibleShares.length === 1
                      ? "A recipe was shared with you"
                      : `${visibleShares.length} recipes were shared with you`}
                  </p>
                  <ul className="space-y-1">
                    {visibleShares.map((n) => (
                      <li key={n.share_id} className="text-sm text-brand-700">
                        <Link
                          to={`/recipes/${n.recipe_id}`}
                          className="font-medium underline underline-offset-2"
                        >
                          {n.recipe_title}
                        </Link>
                        {" "}— shared by{" "}
                        <span className="font-medium">
                          {n.shared_by_username || "someone"}
                        </span>
                        <span className="ml-1 text-xs text-brand-500 capitalize">
                          ({n.permission} access)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                onClick={handleDismissShares}
                className="shrink-0 text-brand-400 hover:text-brand-600 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search row */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-field pl-9"
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setAiSearch(false); }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => { setAiSearch((v) => !v); setAiResults([]); setAiQuery(""); setAiSearched(false); }}
          className={`btn-secondary px-3 ${aiSearch ? "bg-brand-50 border-brand-400 text-brand-600" : ""}`}
          title="AI Search"
        >
          <Bot className="w-5 h-5" />
        </button>
      </div>

      {/* AI search bar */}
      <AnimatePresence>
        {aiSearch && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleAiSearch}
            className="overflow-hidden mb-4"
          >
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="Ask AI: recipes with chicken and lemon..."
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
              />
              <button type="submit" className="btn-primary px-4" disabled={aiLoading}>
                {aiLoading ? "…" : "Go"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        <button
          onClick={() => setCategory("")}
          className={`badge shrink-0 px-3 py-1.5 text-xs font-medium border transition-all
            ${!category ? "bg-brand-500 text-white border-brand-500" : "bg-white text-gray-600 border-gray-200"}`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat === category ? "" : cat)}
            className={`badge shrink-0 px-3 py-1.5 text-xs font-medium border transition-all whitespace-nowrap
              ${category === cat ? "bg-brand-500 text-white border-brand-500" : "bg-white text-gray-600 border-gray-200"}`}
          >
            {CATEGORY_EMOJI[cat]} {cat}
          </button>
        ))}
      </div>

      {/* AI results — shown instead of the regular grid once a search has run */}
      {aiSearched ? (
        aiResults.length > 0 ? (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              AI Suggestions
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {aiResults.map((r, i) =>
                r.id ? (
                  <div key={r.id} className="relative">
                    <RecipeCard
                      recipe={{ ...r, ingredients: [], steps: [], created_at: "", updated_at: "" }}
                      index={i}
                    />
                    <span className="absolute top-3 right-3 text-xs bg-brand-100 text-brand-700 font-medium px-2 py-0.5 rounded-full">
                      {Math.round(r.score * 100)}% match
                    </span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-12 text-center"
          >
            <span className="text-4xl">🔍</span>
            <p className="font-display font-semibold text-gray-700">No matching recipes found</p>
            <p className="text-sm text-gray-400">Try different keywords or add more recipes first.</p>
          </motion.div>
        )
      ) : isLoading ? (
        <LoadingSpinner />
      ) : recipes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4 py-16 text-center"
        >
          <span className="text-6xl">🍳</span>
          <div>
            <p className="font-display text-xl font-semibold text-gray-800">No recipes yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Add your first recipe or scan one from a cookbook!
            </p>
          </div>
          <Link to="/recipes/new" className="btn-primary">
            <Plus className="w-4 h-4" /> Add Recipe
          </Link>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {recipes.map((r, i) => (
            <RecipeCard key={r.id} recipe={r} index={i} />
          ))}
        </div>
      )}

      {/* FAB */}
      <Link
        to="/recipes/new"
        className="fixed bottom-24 right-4 w-14 h-14 bg-brand-500 text-white rounded-2xl shadow-lg
                   flex items-center justify-center hover:bg-brand-600 active:scale-95 transition-all
                   safe-bottom z-30"
      >
        <Plus className="w-7 h-7" />
      </Link>
    </div>
  );
}

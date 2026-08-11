import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { recipesApi } from "../utils/api";
import RecipeCard from "../components/recipes/RecipeCard";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import type { RecipeListItem } from "../types";

export default function FavoritesPage() {
  const { data: recipes = [], isLoading } = useQuery<RecipeListItem[]>({
    queryKey: ["recipes", { favorites_only: true }],
    queryFn: async () => {
      const { data } = await recipesApi.list({ favorites_only: true });
      return data;
    },
  });

  return (
    <div className="page-container">
      <div className="mb-6 flex items-center gap-2">
        <Heart className="w-6 h-6 text-red-500 fill-red-500" />
        <h1 className="font-display text-2xl font-bold text-gray-900">Favorites</h1>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : recipes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4 py-16 text-center"
        >
          <Heart className="w-12 h-12 text-gray-200" />
          <div>
            <p className="font-display text-xl font-semibold text-gray-800">No favorites yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Tap the heart icon on any recipe to add it here.
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {recipes.map((r, i) => (
            <RecipeCard key={r.id} recipe={r} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

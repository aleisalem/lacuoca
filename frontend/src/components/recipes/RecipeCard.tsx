import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Users, Tag, Bot, Heart } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recipesApi } from "../../utils/api";
import type { RecipeListItem } from "../../types";

const CATEGORY_COLORS: Record<string, string> = {
  breakfast: "bg-yellow-100 text-yellow-700",
  lunch:     "bg-green-100 text-green-700",
  dinner:    "bg-blue-100 text-blue-700",
  dessert:   "bg-pink-100 text-pink-700",
  snack:     "bg-orange-100 text-orange-700",
  drink:     "bg-cyan-100 text-cyan-700",
  soup:      "bg-amber-100 text-amber-700",
  salad:     "bg-lime-100 text-lime-700",
  bread:     "bg-stone-100 text-stone-700",
  other:     "bg-gray-100 text-gray-600",
};

const CATEGORY_EMOJI: Record<string, string> = {
  breakfast: "🍳", lunch: "🥗", dinner: "🍽️", dessert: "🍰",
  snack: "🍿", drink: "🥤", soup: "🍲", salad: "🥙", bread: "🍞", other: "🍴",
};

interface Props {
  recipe: RecipeListItem;
  index?: number;
}

export default function RecipeCard({ recipe, index = 0 }: Props) {
  const totalTime = (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);
  const qc = useQueryClient();

  const favMutation = useMutation({
    mutationFn: () =>
      recipe.is_favorite ? recipesApi.unfavorite(recipe.id) : recipesApi.favorite(recipe.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ y: -2 }}
      className="card hover:shadow-card-hover transition-shadow duration-200"
    >
      <Link to={`/recipes/${recipe.id}`} className="block">
        {recipe.image_path ? (
          <img
            src={recipe.image_path}
            alt={recipe.title}
            className="w-full h-40 object-cover"
          />
        ) : (
          <div className="w-full h-40 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center">
            <span className="text-5xl">
              {CATEGORY_EMOJI[recipe.category] ?? "🍴"}
            </span>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-display font-semibold text-gray-900 leading-snug line-clamp-2">
              {recipe.title}
            </h3>
            <span className={`badge shrink-0 ${CATEGORY_COLORS[recipe.category] ?? "bg-gray-100 text-gray-600"}`}>
              {recipe.category}
            </span>
          </div>

          {recipe.description && (
            <p className="text-xs text-gray-500 line-clamp-2 mb-3">
              {recipe.description}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {totalTime} min
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {recipe.servings}
              </span>
            )}
            {recipe.tags && (
              <span className="flex items-center gap-1 truncate">
                <Tag className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{recipe.tags.split(",")[0]}</span>
              </span>
            )}
            {recipe.is_ai_generated && (
              <span className="flex items-center gap-1 text-purple-500 font-medium ml-auto">
                <Bot className="w-3.5 h-3.5" />
                AI
              </span>
            )}
            {recipe.is_draft && (
              <span className="badge bg-amber-100 text-amber-700 text-[10px]">Draft</span>
            )}
          </div>
        </div>
      </Link>

      {/* Favorite button — outside the Link so it doesn't navigate */}
      <button
        onClick={(e) => { e.preventDefault(); favMutation.mutate(); }}
        className="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm
                   flex items-center justify-center shadow-sm transition-colors
                   hover:bg-white active:scale-90"
        title={recipe.is_favorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Heart
          className={`w-4 h-4 transition-colors ${
            recipe.is_favorite ? "fill-red-500 text-red-500" : "text-gray-400"
          }`}
        />
      </button>
    </motion.div>
  );
}

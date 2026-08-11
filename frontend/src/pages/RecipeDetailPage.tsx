import { useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Clock, Users, Edit3, Trash2, Share2,
  CheckCircle2, Circle, X, Loader2, ChevronDown, ChevronUp, ImagePlus, Bot, Heart,
} from "lucide-react";
import toast from "react-hot-toast";
import { recipesApi } from "../utils/api";
import { useAuthStore } from "../store/authStore";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import type { Recipe, SharePermission } from "../types";

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [showShare, setShowShare] = useState(false);
  const [shareTarget, setShareTarget] = useState("");
  const [sharePermission, setSharePermission] = useState<SharePermission>("read");
  const [showIngredients, setShowIngredients] = useState(true);
  const [showSteps, setShowSteps] = useState(true);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const { data: recipe, isLoading } = useQuery<Recipe>({
    queryKey: ["recipe", id, user?.unit_system],
    queryFn: async () => {
      const { data } = await recipesApi.get(id!, user?.unit_system);
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => recipesApi.delete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      navigate("/");
      toast.success("Recipe deleted");
    },
    onError: () => toast.error("Failed to delete recipe"),
  });

  const favMutation = useMutation({
    mutationFn: () =>
      recipe?.is_favorite ? recipesApi.unfavorite(id!) : recipesApi.favorite(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipe", id] }),
  });

  const shareMutation = useMutation({
    mutationFn: () =>
      recipesApi.share(id!, { shared_with_username: shareTarget, permission: sharePermission }),
    onSuccess: () => {
      toast.success(`Shared with ${shareTarget}`);
      setShowShare(false);
      setShareTarget("");
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail ?? "Failed to share";
      toast.error(msg);
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadingImage(true);
    try {
      await recipesApi.uploadImage(id, file);
      qc.invalidateQueries({ queryKey: ["recipe", id] });
      toast.success("Image updated!");
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (!recipe) return null;

  const isOwner = recipe.owner_id === user?.id;
  const canEdit = isOwner || recipe.my_permission === "edit";
  // Permission ceiling: non-owners with read access can only re-share as read
  const canGrantEdit = isOwner || recipe.my_permission === "edit";
  const totalTime = (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);

  const toggleStep = (idx: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div className="page-container">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)} className="btn-ghost px-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          {/* Favorite */}
          <button
            onClick={() => favMutation.mutate()}
            className="btn-ghost px-2"
            title={recipe.is_favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart
              className={`w-5 h-5 transition-colors ${
                recipe.is_favorite ? "fill-red-500 text-red-500" : "text-gray-400"
              }`}
            />
          </button>

          {/* Share — available to everyone with access */}
          <button
            onClick={() => setShowShare(true)}
            className="btn-ghost px-2 text-gray-500"
            title="Share this recipe"
          >
            <Share2 className="w-5 h-5" />
          </button>

          {/* Edit — owner or user with edit permission */}
          {canEdit && (
            <Link to={`/recipes/${id}/edit`} className="btn-ghost px-2 text-gray-500">
              <Edit3 className="w-5 h-5" />
            </Link>
          )}

          {/* Delete — owner only */}
          {isOwner && (
            <button
              onClick={() => {
                if (confirm("Delete this recipe?")) deleteMutation.mutate();
              }}
              className="btn-ghost px-2 text-red-400"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Image / hero */}
      <div className="relative rounded-3xl overflow-hidden mb-6">
        {recipe.image_path ? (
          <img src={recipe.image_path} alt={recipe.title} className="w-full h-56 object-cover" />
        ) : (
          <motion.div
            className="h-40 bg-gradient-to-br from-brand-100 to-orange-100 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="text-6xl">🍴</span>
          </motion.div>
        )}
        {canEdit && (
          <>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage}
              className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-white
                         rounded-xl px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors"
            >
              {uploadingImage
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ImagePlus className="w-3.5 h-3.5" />}
              {recipe.image_path ? "Change photo" : "Add photo"}
            </button>
          </>
        )}
      </div>

      {/* Shared-by banner */}
      {recipe.shared_by_username && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-brand-50 border border-brand-100 rounded-2xl"
        >
          <Share2 className="w-4 h-4 text-brand-500 shrink-0" />
          <span className="text-sm text-brand-700">
            Shared with you by{" "}
            <span className="font-semibold">{recipe.shared_by_username}</span>
            {" · "}
            <span className="capitalize">{recipe.my_permission} access</span>
          </span>
        </motion.div>
      )}

      {/* Title + meta */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="badge bg-brand-100 text-brand-700">{recipe.category}</span>
          {recipe.is_draft && (
            <span className="badge bg-amber-100 text-amber-700">Draft</span>
          )}
          {recipe.is_ai_generated && (
            <span className="badge bg-purple-100 text-purple-700 flex items-center gap-1">
              <Bot className="w-3 h-3" />
              AI{recipe.ai_model_used ? ` · ${recipe.ai_model_used}` : ""}
            </span>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold text-gray-900 mb-3">{recipe.title}</h1>

        {recipe.description && (
          <p className="text-sm text-gray-500 mb-4">{recipe.description}</p>
        )}

        <div className="flex flex-wrap gap-4 mb-6 text-sm text-gray-500">
          {totalTime > 0 && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-brand-400" />
              {totalTime} min total
            </span>
          )}
          {recipe.prep_time_minutes && (
            <span className="text-xs text-gray-400">
              Prep: {recipe.prep_time_minutes} min
            </span>
          )}
          {recipe.cook_time_minutes && (
            <span className="text-xs text-gray-400">
              Cook: {recipe.cook_time_minutes} min
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-400" />
              {recipe.servings} servings
            </span>
          )}
        </div>

        {recipe.tags && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {recipe.tags.split(",").map((t) => (
              <span key={t} className="badge bg-gray-100 text-gray-600 text-xs">
                #{t.trim()}
              </span>
            ))}
          </div>
        )}
      </motion.div>

      {/* Ingredients */}
      {recipe.ingredients.length > 0 && (
        <div className="card mb-4">
          <button
            onClick={() => setShowIngredients((v) => !v)}
            className="w-full flex items-center justify-between p-4"
          >
            <h2 className="font-display font-bold text-gray-900">
              Ingredients ({recipe.ingredients.length})
            </h2>
            {showIngredients ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          <AnimatePresence>
            {showIngredients && (
              <motion.ul
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                {recipe.ingredients.map((ing) => (
                  <li
                    key={ing.id}
                    className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-50"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                    <span className="flex-1 text-sm text-gray-700">{ing.name}</span>
                    {ing.quantity && (
                      <span className="text-sm font-medium text-brand-600">
                        {ing.quantity} {ing.unit ?? ""}
                      </span>
                    )}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Steps */}
      {recipe.steps.length > 0 && (
        <div className="card mb-6">
          <button
            onClick={() => setShowSteps((v) => !v)}
            className="w-full flex items-center justify-between p-4"
          >
            <h2 className="font-display font-bold text-gray-900">
              Steps ({recipe.steps.length})
            </h2>
            {showSteps ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          <AnimatePresence>
            {showSteps && (
              <motion.ol
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                {recipe.steps.map((step, idx) => (
                  <motion.li
                    key={step.id}
                    onClick={() => toggleStep(idx)}
                    whileTap={{ scale: 0.98 }}
                    className={`flex gap-3 px-4 py-3 border-t border-gray-50 cursor-pointer
                      transition-colors ${checkedSteps.has(idx) ? "bg-sage-50" : ""}`}
                  >
                    <span className="shrink-0 mt-0.5">
                      {checkedSteps.has(idx) ? (
                        <CheckCircle2 className="w-5 h-5 text-sage-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" />
                      )}
                    </span>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-brand-500 mr-2">
                        Step {step.order}
                      </span>
                      <p className={`text-sm text-gray-700 ${checkedSteps.has(idx) ? "line-through text-gray-400" : ""}`}>
                        {step.description}
                      </p>
                      {step.duration_minutes && (
                        <span className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {step.duration_minutes} min
                        </span>
                      )}
                    </div>
                  </motion.li>
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Share modal */}
      <AnimatePresence>
        {showShare && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end p-4"
            onClick={(e) => e.target === e.currentTarget && setShowShare(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="card w-full max-w-lg mx-auto p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-gray-900">Share Recipe</h3>
                <button onClick={() => setShowShare(false)} className="btn-ghost p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                className="input-field mb-3"
                placeholder="Username to share with"
                value={shareTarget}
                onChange={(e) => setShareTarget(e.target.value)}
              />
              <div className="flex gap-2 mb-4">
                {(["read", "edit"] as SharePermission[])
                  .filter((p) => canGrantEdit || p === "read")
                  .map((p) => (
                    <button
                      key={p}
                      onClick={() => setSharePermission(p)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all
                        ${sharePermission === p
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-white text-gray-600 border-gray-200"}`}
                    >
                      {p === "read" ? "👁 View only" : "✏️ Can edit"}
                    </button>
                  ))}
              </div>
              {!canGrantEdit && (
                <p className="text-xs text-gray-400 mb-3">
                  You have read-only access, so you can only share as view-only.
                </p>
              )}
              <button
                onClick={() => shareMutation.mutate()}
                className="btn-primary w-full"
                disabled={!shareTarget || shareMutation.isPending}
              >
                {shareMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Share
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

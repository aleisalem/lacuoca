import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { recipesApi } from "../utils/api";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import type { Recipe, RecipeCategory } from "../types";

const CATEGORIES: RecipeCategory[] = [
  "breakfast", "lunch", "dinner", "dessert", "snack", "drink", "soup", "salad", "bread", "other",
];

interface IngForm { name: string; quantity: string; unit: string; notes: string; }
interface StepForm { description: string; duration_minutes: string; }

export default function RecipeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: recipe, isLoading } = useQuery<Recipe>({
    queryKey: ["recipe", id],
    queryFn: async () => { const { data } = await recipesApi.get(id!); return data; },
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RecipeCategory>("other");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");
  const [tags, setTags] = useState("");
  const [ingredients, setIngredients] = useState<IngForm[]>([]);
  const [steps, setSteps] = useState<StepForm[]>([]);

  useEffect(() => {
    if (!recipe) return;
    setTitle(recipe.title);
    setDescription(recipe.description ?? "");
    setCategory(recipe.category);
    setPrepTime(recipe.prep_time_minutes?.toString() ?? "");
    setCookTime(recipe.cook_time_minutes?.toString() ?? "");
    setServings(recipe.servings?.toString() ?? "");
    setTags(recipe.tags ?? "");
    setIngredients(
      recipe.ingredients.map((i) => ({
        name: i.name,
        quantity: i.quantity?.toString() ?? "",
        unit: i.unit ?? "",
        notes: i.notes ?? "",
      }))
    );
    setSteps(
      recipe.steps.map((s) => ({
        description: s.description,
        duration_minutes: s.duration_minutes?.toString() ?? "",
      }))
    );
  }, [recipe]);

  const updateMutation = useMutation({
    mutationFn: (data: object) => recipesApi.update(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipe", id] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipes/${id}`);
      toast.success("Recipe updated!");
    },
    onError: () => toast.error("Failed to update recipe"),
  });

  if (isLoading) return <LoadingSpinner />;

  const toInt = (s: string): number | null => { const n = parseInt(s, 10); return isNaN(n) ? null : n; };
  const toFloat = (s: string): number | null => { const n = parseFloat(s); return isNaN(n) ? null : n; };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      title: title.trim(), description: description.trim() || null, category,
      prep_time_minutes: toInt(prepTime),
      cook_time_minutes: toInt(cookTime),
      servings: toInt(servings),
      tags: tags.trim() || null,
      ingredients: ingredients.filter((i) => i.name.trim()).map((i, idx) => ({
        name: i.name.trim(),
        quantity: toFloat(i.quantity),
        unit: i.unit.trim() || null,
        notes: i.notes.trim() || null,
        order: idx,
      })),
      steps: steps.filter((s) => s.description.trim()).map((s, idx) => ({
        order: idx + 1,
        description: s.description.trim(),
        duration_minutes: toInt(s.duration_minutes),
      })),
    });
  };

  const addIngredient = () => setIngredients((v) => [...v, { name: "", quantity: "", unit: "", notes: "" }]);
  const removeIngredient = (i: number) => setIngredients((v) => v.filter((_, idx) => idx !== i));
  const updateIngredient = (i: number, f: keyof IngForm, val: string) =>
    setIngredients((v) => v.map((ing, idx) => idx === i ? { ...ing, [f]: val } : ing));

  const addStep = () => setSteps((v) => [...v, { description: "", duration_minutes: "" }]);
  const removeStep = (i: number) => setSteps((v) => v.filter((_, idx) => idx !== i));
  const updateStep = (i: number, f: keyof StepForm, val: string) =>
    setSteps((v) => v.map((s, idx) => idx === i ? { ...s, [f]: val } : s));

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="btn-ghost px-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display text-xl font-bold">Edit Recipe</h1>
        <div className="w-10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-4 space-y-4">
          <h2 className="font-display font-bold text-gray-800">Details</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea className="input-field resize-none h-20" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value as RecipeCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prep (min)</label>
              <input type="number" className="input-field" value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)} min="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cook (min)</label>
              <input type="number" className="input-field" value={cookTime}
                onChange={(e) => setCookTime(e.target.value)} min="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Servings</label>
              <input type="number" className="input-field" value={servings}
                onChange={(e) => setServings(e.target.value)} min="1" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tags</label>
            <input className="input-field" value={tags} onChange={(e) => setTags(e.target.value)}
              placeholder="italian, pasta, quick" />
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-display font-bold text-gray-800 mb-4">Ingredients</h2>
          <div className="space-y-3">
            {ingredients.map((ing, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <input className="input-field col-span-3" placeholder="Name" value={ing.name}
                    onChange={(e) => updateIngredient(i, "name", e.target.value)} />
                  <input className="input-field" type="number" placeholder="Qty" value={ing.quantity}
                    onChange={(e) => updateIngredient(i, "quantity", e.target.value)} step="0.01" min="0" />
                  <input className="input-field" placeholder="Unit" value={ing.unit}
                    onChange={(e) => updateIngredient(i, "unit", e.target.value)} />
                  <input className="input-field" placeholder="Notes" value={ing.notes}
                    onChange={(e) => updateIngredient(i, "notes", e.target.value)} />
                </div>
                {ingredients.length > 1 && (
                  <button type="button" onClick={() => removeIngredient(i)} className="mt-3 text-red-400 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
          <button type="button" onClick={addIngredient} className="btn-ghost mt-3 text-brand-600">
            <Plus className="w-4 h-4" /> Add Ingredient
          </button>
        </div>

        <div className="card p-4">
          <h2 className="font-display font-bold text-gray-800 mb-4">Steps</h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex gap-2 items-start">
                <span className="shrink-0 w-7 h-7 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center mt-3">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <textarea className="input-field resize-none h-24" placeholder={`Step ${i + 1}…`}
                    value={step.description} onChange={(e) => updateStep(i, "description", e.target.value)} />
                  <input className="input-field" type="number" placeholder="Duration (min, optional)"
                    value={step.duration_minutes} onChange={(e) => updateStep(i, "duration_minutes", e.target.value)} min="0" />
                </div>
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)} className="mt-3 text-red-400 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
          <button type="button" onClick={addStep} className="btn-ghost mt-3 text-brand-600">
            <Plus className="w-4 h-4" /> Add Step
          </button>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Changes
        </button>
      </form>
    </div>
  );
}

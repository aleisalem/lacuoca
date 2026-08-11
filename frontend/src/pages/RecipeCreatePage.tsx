import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera, Plus, Trash2, Loader2, Wand2, ImagePlus, X, Clock, Link } from "lucide-react";
import toast from "react-hot-toast";
import { recipesApi, aiApi, ocrApi } from "../utils/api";
import { useAuthStore } from "../store/authStore";
import OCRCapture from "../components/recipes/OCRCapture";
import type { RecipeCategory } from "../types";

const CATEGORIES: RecipeCategory[] = [
  "breakfast", "lunch", "dinner", "dessert", "snack", "drink", "soup", "salad", "bread", "other",
];

interface IngForm { name: string; quantity: string; unit: string; notes: string; }
interface StepForm { description: string; duration_minutes: string; }

export default function RecipeCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RecipeCategory>("other");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");
  const [tags, setTags] = useState("");
  const [ingredients, setIngredients] = useState<IngForm[]>([
    { name: "", quantity: "", unit: "", notes: "" },
  ]);
  const [steps, setSteps] = useState<StepForm[]>([{ description: "", duration_minutes: "" }]);
  const [showOCR, setShowOCR] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAIGen, setShowAIGen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [urlImportLoading, setUrlImportLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [aiModelUsed, setAiModelUsed] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [bgTaskId, setBgTaskId] = useState<string | null>(null);
  const [bgStatus, setBgStatus] = useState<"pending" | "done" | "failed" | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [urlImportTaskId, setUrlImportTaskId] = useState<string | null>(null);
  const [urlImportStatus, setUrlImportStatus] = useState<"pending" | "done" | "failed" | null>(null);
  const urlImportPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll background OCR task until done
  useEffect(() => {
    if (!bgTaskId) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await ocrApi.getTask(bgTaskId);
        if (data.status === "done") {
          clearInterval(pollRef.current!);
          setBgStatus("done");
          setBgTaskId(null);
          if (data.result) {
            handleOCRResult(data.result);
            toast.success("Background scan complete! Review and save.");
          }
        } else if (data.status === "failed") {
          clearInterval(pollRef.current!);
          setBgStatus("failed");
          setBgTaskId(null);
          toast.error("Background scan failed");
        }
      } catch {
        clearInterval(pollRef.current!);
        setBgTaskId(null);
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [bgTaskId]);

  // Poll background URL import task until done
  useEffect(() => {
    if (!urlImportTaskId) return;
    urlImportPollRef.current = setInterval(async () => {
      try {
        const { data } = await aiApi.importUrlStatus(urlImportTaskId);
        if (data.status === "done") {
          clearInterval(urlImportPollRef.current!);
          setUrlImportTaskId(null);
          setUrlImportStatus("done");
          if (data.result) applyUrlImportResult(data.result);
        } else if (data.status === "error") {
          clearInterval(urlImportPollRef.current!);
          setUrlImportTaskId(null);
          setUrlImportStatus("failed");
          toast.error(data.error ?? "Failed to import recipe from URL");
        }
      } catch {
        clearInterval(urlImportPollRef.current!);
        setUrlImportTaskId(null);
        setUrlImportStatus("failed");
        toast.error("Failed to import recipe from URL");
      }
    }, 3000);
    return () => { if (urlImportPollRef.current) clearInterval(urlImportPollRef.current); };
  }, [urlImportTaskId]);

  const createMutation = useMutation({
    mutationFn: (data: object) => recipesApi.create(data),
    onSuccess: async (res) => {
      if (imageFile) {
        try {
          await recipesApi.uploadImage(res.data.id, imageFile);
        } catch {
          toast.error("Recipe saved, but image upload failed");
        }
      }
      qc.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipes/${res.data.id}`);
      toast.success("Recipe created!");
    },
    onError: () => toast.error("Failed to create recipe"),
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const addIngredient = () =>
    setIngredients((v) => [...v, { name: "", quantity: "", unit: "", notes: "" }]);

  const removeIngredient = (i: number) =>
    setIngredients((v) => v.filter((_, idx) => idx !== i));

  const updateIngredient = (i: number, field: keyof IngForm, val: string) =>
    setIngredients((v) => v.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing));

  const addStep = () =>
    setSteps((v) => [...v, { description: "", duration_minutes: "" }]);

  const removeStep = (i: number) =>
    setSteps((v) => v.filter((_, idx) => idx !== i));

  const updateStep = (i: number, field: keyof StepForm, val: string) =>
    setSteps((v) => v.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const handleOCRResult = (result: any) => {
    if (result.title) setTitle(result.title);
    if (result.ingredients?.length) {
      setIngredients(
        result.ingredients.map((ing: any) => ({
          name: ing.name ?? "",
          quantity: ing.quantity?.toString() ?? "",
          unit: ing.unit ?? "",
          notes: "",
        }))
      );
    }
    if (result.steps?.length) {
      setSteps(
        result.steps.map((s: any) => ({
          description: s.description ?? "",
          duration_minutes: "",
        }))
      );
    }
    setShowOCR(false);
  };

  const applyUrlImportResult = (data: any) => {
    setTitle(data.title ?? "");
    setDescription(data.description ?? "");
    setCategory(data.category ?? "other");
    setPrepTime(data.prep_time_minutes?.toString() ?? "");
    setCookTime(data.cook_time_minutes?.toString() ?? "");
    setServings(data.servings?.toString() ?? "");
    setTags(Array.isArray(data.tags) ? data.tags.join(", ") : (data.tags ?? ""));
    if (data.ingredients?.length) {
      setIngredients(
        data.ingredients.map((i: any) => ({
          name: i.name ?? "",
          quantity: i.quantity?.toString() ?? "",
          unit: i.unit ?? "",
          notes: "",
        }))
      );
    }
    if (data.steps?.length) {
      setSteps(data.steps.map((s: any) => ({
        description: s.description ?? "",
        duration_minutes: s.duration_minutes?.toString() ?? "",
      })));
    }
    setIsAiGenerated(true);
    setAiModelUsed(data._ai_model ?? null);
  };

  const handleUrlImport = async () => {
    if (!importUrl.trim()) return;
    setUrlImportLoading(true);
    try {
      const { data } = await aiApi.importUrl(importUrl.trim());
      setUrlImportTaskId(data.task_id);
      setUrlImportStatus("pending");
      setShowUrlImport(false);
      setImportUrl("");
    } catch {
      toast.error("Failed to start URL import");
    } finally {
      setUrlImportLoading(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await aiApi.generate(aiPrompt, undefined, user?.unit_system ?? "metric");
      setTitle(data.title ?? "");
      setDescription(data.description ?? "");
      setCategory(data.category ?? "other");
      setPrepTime(data.prep_time_minutes?.toString() ?? "");
      setCookTime(data.cook_time_minutes?.toString() ?? "");
      setServings(data.servings?.toString() ?? "");
      setTags(Array.isArray(data.tags) ? data.tags.join(", ") : (data.tags ?? ""));
      if (data.ingredients?.length) {
        setIngredients(
          data.ingredients.map((i: any) => ({
            name: i.name ?? "",
            quantity: i.quantity?.toString() ?? "",
            unit: i.unit ?? "",
            notes: "",
          }))
        );
      }
      if (data.steps?.length) {
        setSteps(data.steps.map((s: any) => ({ description: s.description ?? "", duration_minutes: s.duration_minutes?.toString() ?? "" })));
      }
      setIsAiGenerated(true);
      setAiModelUsed(data._ai_model ?? null);
      setShowAIGen(false);
      toast.success("Recipe generated by AI!");
    } catch {
      toast.error("AI generation failed");
    } finally {
      setAiLoading(false);
    }
  };

  const toInt = (s: string): number | null => {
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  };
  const toFloat = (s: string): number | null => {
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      prep_time_minutes: toInt(prepTime),
      cook_time_minutes: toInt(cookTime),
      servings: toInt(servings),
      tags: String(tags).trim() || null,
      is_ai_generated: isAiGenerated,
      ai_model_used: aiModelUsed,
      ingredients: ingredients
        .filter((i) => i.name.trim())
        .map((i, idx) => ({
          name: i.name.trim(),
          quantity: toFloat(i.quantity),
          unit: i.unit.trim() || null,
          notes: i.notes.trim() || null,
          order: idx,
        })),
      steps: steps
        .filter((s) => s.description.trim())
        .map((s, idx) => ({
          order: idx + 1,
          description: s.description.trim(),
          duration_minutes: toInt(s.duration_minutes),
        })),
    };
    createMutation.mutate(body);
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="btn-ghost px-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display text-xl font-bold">New Recipe</h1>
        <div className="w-10" />
      </div>

      {/* Quick add buttons */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setShowOCR(true)}
          className="flex-1 btn-secondary"
        >
          <Camera className="w-4 h-4" /> Scan Recipe
        </button>
        <button
          type="button"
          onClick={() => setShowAIGen(true)}
          className="flex-1 btn-secondary"
        >
          <Wand2 className="w-4 h-4" /> AI Generate
        </button>
      </div>
      <div className="mb-6">
        <button
          type="button"
          onClick={() => { setShowUrlImport((v) => !v); setShowAIGen(false); }}
          className="w-full btn-secondary"
        >
          <Link className="w-4 h-4" /> Import from URL
        </button>
      </div>

      {/* URL import panel */}
      <AnimatePresence>
        {showUrlImport && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="card p-4 mb-6 overflow-hidden"
          >
            <p className="text-xs font-medium text-gray-500 mb-2">Paste a link to a recipe page</p>
            <input
              type="url"
              className="input-field mb-3"
              placeholder="https://example.com/my-recipe"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlImport()}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUrlImport}
                className="btn-primary flex-1"
                disabled={urlImportLoading || !importUrl.trim()}
              >
                {urlImportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                Import
              </button>
              <button type="button" onClick={() => setShowUrlImport(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI generate prompt */}
      <AnimatePresence>
        {showAIGen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="card p-4 mb-6 overflow-hidden"
          >
            <p className="text-xs font-medium text-gray-500 mb-2">Describe the recipe you want</p>
            <textarea
              className="input-field resize-none h-20 mb-3"
              placeholder="e.g. A creamy mushroom risotto for 2 people, Italian style…"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAIGenerate}
                className="btn-primary flex-1"
                disabled={aiLoading}
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Generate
              </button>
              <button type="button" onClick={() => setShowAIGen(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="card p-4 space-y-4">
          <h2 className="font-display font-bold text-gray-800">Details</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Recipe name" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea className="input-field resize-none h-20" value={description}
              onChange={(e) => setDescription(e.target.value)} placeholder="Short description…" />
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
                onChange={(e) => setPrepTime(e.target.value)} placeholder="15" min="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cook (min)</label>
              <input type="number" className="input-field" value={cookTime}
                onChange={(e) => setCookTime(e.target.value)} placeholder="30" min="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Servings</label>
              <input type="number" className="input-field" value={servings}
                onChange={(e) => setServings(e.target.value)} placeholder="4" min="1" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tags (comma separated)</label>
            <input className="input-field" value={tags} onChange={(e) => setTags(e.target.value)}
              placeholder="italian, pasta, quick" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Photo (optional)</label>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageChange}
            />
            {imagePreview ? (
              <div className="relative rounded-2xl overflow-hidden h-40">
                <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col
                           items-center justify-center gap-2 text-gray-400 hover:border-brand-300
                           hover:text-brand-400 transition-colors"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-xs">Tap to add a photo</span>
              </button>
            )}
          </div>
        </div>

        {/* Ingredients */}
        <div className="card p-4">
          <h2 className="font-display font-bold text-gray-800 mb-4">Ingredients</h2>
          <div className="space-y-3">
            {ingredients.map((ing, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2 items-start"
              >
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <input className="input-field col-span-3" placeholder="Ingredient name" value={ing.name}
                    onChange={(e) => updateIngredient(i, "name", e.target.value)} />
                  <input className="input-field" placeholder="Qty" type="number" value={ing.quantity}
                    onChange={(e) => updateIngredient(i, "quantity", e.target.value)} min="0" step="0.01" />
                  <input className="input-field" placeholder="Unit" value={ing.unit}
                    onChange={(e) => updateIngredient(i, "unit", e.target.value)} />
                  <input className="input-field" placeholder="Notes" value={ing.notes}
                    onChange={(e) => updateIngredient(i, "notes", e.target.value)} />
                </div>
                {ingredients.length > 1 && (
                  <button type="button" onClick={() => removeIngredient(i)} className="mt-3 text-red-400 hover:text-red-600 p-1">
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

        {/* Steps */}
        <div className="card p-4">
          <h2 className="font-display font-bold text-gray-800 mb-4">Steps</h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2 items-start"
              >
                <span className="shrink-0 w-7 h-7 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center mt-3">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <textarea
                    className="input-field resize-none h-24"
                    placeholder={`Step ${i + 1}…`}
                    value={step.description}
                    onChange={(e) => updateStep(i, "description", e.target.value)}
                  />
                  <input
                    className="input-field"
                    type="number"
                    placeholder="Duration (min, optional)"
                    value={step.duration_minutes}
                    onChange={(e) => updateStep(i, "duration_minutes", e.target.value)}
                    min="0"
                  />
                </div>
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)} className="mt-3 text-red-400 hover:text-red-600 p-1">
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

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={createMutation.isPending || !title.trim()}
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Recipe
        </button>
      </form>

      {/* Background task status banners */}
      <AnimatePresence>
        {bgTaskId && (
          <motion.div
            key="bg-scan"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-16 inset-x-4 z-40 mx-auto max-w-lg"
          >
            <div className="card p-3 flex items-center gap-3 border-brand-200 bg-brand-50">
              <Clock className="w-4 h-4 text-brand-500 shrink-0 animate-pulse" />
              <p className="text-sm text-brand-700 flex-1">Scanning recipe in the background…</p>
              <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />
            </div>
          </motion.div>
        )}
        {bgStatus === "done" && (
          <motion.div
            key="bg-done"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-16 inset-x-4 z-40 mx-auto max-w-lg"
          >
            <div className="card p-3 flex items-center gap-3 border-green-200 bg-green-50">
              <p className="text-sm text-green-700 flex-1">Scan complete — form populated!</p>
              <button onClick={() => setBgStatus(null)} className="text-green-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
        {urlImportTaskId && (
          <motion.div
            key="url-import-pending"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-16 inset-x-4 z-40 mx-auto max-w-lg"
          >
            <div className="card p-3 flex items-center gap-3 border-brand-200 bg-brand-50">
              <Clock className="w-4 h-4 text-brand-500 shrink-0 animate-pulse" />
              <p className="text-sm text-brand-700 flex-1">Importing recipe from URL…</p>
              <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />
            </div>
          </motion.div>
        )}
        {urlImportStatus === "done" && (
          <motion.div
            key="url-import-done"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-16 inset-x-4 z-40 mx-auto max-w-lg"
          >
            <div className="card p-3 flex items-center gap-3 border-green-200 bg-green-50">
              <p className="text-sm text-green-700 flex-1">Recipe imported — review and save!</p>
              <button onClick={() => setUrlImportStatus(null)} className="text-green-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OCR modal */}
      <AnimatePresence>
        {showOCR && (
          <OCRCapture
            onResult={handleOCRResult}
            onClose={() => setShowOCR(false)}
            onBackgroundStarted={(taskId) => { setBgTaskId(taskId); setBgStatus("pending"); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

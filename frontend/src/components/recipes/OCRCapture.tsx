import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Upload, Loader2, ChefHat, X, CheckCircle2,
  AlertCircle, ArrowRight, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import { ocrApi } from "../../utils/api";
import type { Ingredient, Step } from "../../types";

interface OCRResult {
  title: string;
  raw_text: string;
  ingredients: Omit<Ingredient, "id">[];
  steps: Omit<Step, "id">[];
}

interface Props {
  onResult: (result: OCRResult) => void;
  onClose: () => void;
  onBackgroundStarted?: (taskId: string) => void;
}

export default function OCRCapture({ onResult, onClose, onBackgroundStarted }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [language, setLanguage] = useState("eng");
  const [result, setResult] = useState<OCRResult | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    setCurrentFile(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setLoading(true);
    try {
      const { data } = await ocrApi.extract(file, language);
      setResult(data);
    } catch {
      toast.error("Could not read the image. Try again with a clearer photo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendToBackground = async () => {
    if (!currentFile) return;
    try {
      const { data } = await ocrApi.extractBackground(currentFile, language);
      toast.success("Scanning in the background! You'll be notified when done.");
      onBackgroundStarted?.(data.task_id);
      onClose();
    } catch {
      toast.error("Could not start background scan");
    }
  };

  const handleUse = () => {
    if (!result) return;
    onResult(result);
    const found = (result.ingredients?.length ?? 0) + (result.steps?.length ?? 0);
    if (found === 0) {
      toast("Nothing was detected — please fill in the details manually.", { icon: "📝" });
    } else {
      toast.success(`Found ${result.ingredients?.length ?? 0} ingredients and ${result.steps?.length ?? 0} steps — review and save!`);
    }
  };

  const nothingFound = result && result.ingredients.length === 0 && result.steps.length === 0 && !result.title;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="card w-full max-w-sm p-6 max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-gray-900">Scan Recipe</h2>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language selector — only shown before scanning */}
        {!result && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Recipe language</label>
            <div className="flex gap-2">
              {[["eng", "English"], ["deu", "German"], ["eng+deu", "Both"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLanguage(val)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all
                    ${language === val
                      ? "bg-brand-500 text-white border-brand-500"
                      : "bg-white text-gray-600 border-gray-200 hover:border-brand-300"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Image preview */}
        {preview && (
          <div className="mb-4 rounded-2xl overflow-hidden">
            <img src={preview} alt="Preview" className="w-full h-40 object-cover" />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            >
              <ChefHat className="w-10 h-10 text-brand-400" />
            </motion.div>
            <p className="text-sm text-gray-500">Reading your recipe…</p>
            {currentFile && (
              <button
                onClick={handleSendToBackground}
                className="btn-secondary text-xs mt-2"
              >
                <Clock className="w-3.5 h-3.5" />
                Run in Background
              </button>
            )}
          </div>
        )}

        {/* Result preview */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4"
            >
              {nothingFound ? (
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Nothing detected</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      The image may be blurry or the text too small. You can still use it and fill in the details manually.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-sage-50 border border-sage-200">
                  <CheckCircle2 className="w-5 h-5 text-sage-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-sage-800">
                    {result.title && <p className="font-medium mb-1">"{result.title}"</p>}
                    <p className="text-xs text-sage-600">
                      {result.ingredients.length} ingredient{result.ingredients.length !== 1 ? "s" : ""}
                      {" · "}
                      {result.steps.length} step{result.steps.length !== 1 ? "s" : ""} detected
                    </p>
                    <p className="text-xs text-sage-500 mt-1">
                      Review the form after closing — then press <strong>Save Recipe</strong>.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button onClick={handleUse} className="btn-primary flex-1">
                  <ArrowRight className="w-4 h-4" />
                  {nothingFound ? "Fill in manually" : "Use this"}
                </button>
                <button
                  onClick={() => { setResult(null); setPreview(null); setCurrentFile(null); }}
                  className="btn-secondary"
                >
                  Retry
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Capture buttons — only when no result yet */}
        {!result && !loading && (
          <div className="flex flex-col gap-3">
            <button onClick={() => cameraRef.current?.click()} className="btn-primary w-full">
              <Camera className="w-5 h-5" />
              Take a Photo
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary w-full">
              <Upload className="w-5 h-5" />
              Choose from Gallery
            </button>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

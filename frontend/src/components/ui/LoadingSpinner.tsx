import { motion } from "framer-motion";

export default function LoadingSpinner({ size = 8 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center py-12">
      <motion.div
        className={`w-${size} h-${size} rounded-full border-4 border-brand-100 border-t-brand-500`}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
      />
    </div>
  );
}

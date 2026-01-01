import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface DiagnosticProgressProps {
  confidence: number;
  diagnosis?: string;
  className?: string;
}

export const DiagnosticProgress = ({ confidence, diagnosis, className }: DiagnosticProgressProps) => {
  const getConfidenceColor = () => {
    if (confidence >= 70) return "text-accent";
    if (confidence >= 40) return "text-yellow-600";
    return "text-orange-500";
  };

  const getConfidenceLabel = () => {
    if (confidence >= 70) return "High";
    if (confidence >= 40) return "Medium";
    return "Low";
  };

  return (
    <div className={cn("bg-card rounded-xl p-6 border border-border shadow-md animate-scale-in", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Diagnostic Confidence</h3>
        <span className={cn("text-sm font-bold", getConfidenceColor())}>
          {confidence}% - {getConfidenceLabel()}
        </span>
      </div>
      
      <Progress value={confidence} className="h-2 mb-4" />
      
      {diagnosis && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Probable Diagnosis</p>
          <p className="text-base font-semibold text-foreground">{diagnosis}</p>
        </div>
      )}
    </div>
  );
};

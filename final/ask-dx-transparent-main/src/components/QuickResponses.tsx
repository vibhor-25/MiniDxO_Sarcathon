import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuickResponsesProps {
  responses: string[];
  onSelect: (response: string) => void;
  disabled?: boolean;
}

export const QuickResponses = ({ responses, onSelect, disabled }: QuickResponsesProps) => {
  if (responses.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 animate-fade-in">
      {responses.map((response, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          onClick={() => onSelect(response)}
          disabled={disabled}
          className={cn(
            "text-xs rounded-full border-primary/30 hover:bg-primary/10 hover:border-primary transition-all",
            "hover:scale-105 active:scale-95"
          )}
        >
          {response}
        </Button>
      ))}
    </div>
  );
};

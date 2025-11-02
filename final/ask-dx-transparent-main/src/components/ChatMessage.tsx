import { cn } from "@/lib/utils";
import { Activity, User } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "ai";
  content: string;
  reasoning?: string;
  reference?: {
    source: string;
    text: string;
  };
}

export const ChatMessage = ({ role, content, reasoning, reference }: ChatMessageProps) => {
  const isAI = role === "ai";

  return (
    <div className={cn("flex gap-3 animate-slide-up", isAI ? "justify-start" : "justify-end")}>
      {isAI && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md">
          <Activity className="w-4 h-4 text-white" />
        </div>
      )}
      
      <div className={cn("flex flex-col gap-2 max-w-[80%]")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 shadow-sm",
            isAI
              ? "bg-card text-card-foreground border border-border"
              : "bg-gradient-to-br from-primary to-accent text-white"
          )}
        >
          <p className="text-sm leading-relaxed">{content}</p>
        </div>

        {reasoning && (
          <div className="bg-secondary/50 backdrop-blur-sm rounded-xl px-4 py-3 border border-primary/20 animate-fade-in">
            <p className="text-xs font-medium text-primary mb-1">💭 Reasoning</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{reasoning}</p>
          </div>
        )}

        {reference && (
          <div className="bg-accent/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-accent/30 animate-fade-in">
            <p className="text-xs font-medium text-accent mb-1">📚 Reference: {reference.source}</p>
            <p className="text-xs text-muted-foreground italic leading-relaxed">"{reference.text}"</p>
          </div>
        )}
      </div>

      {!isAI && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center shadow-md">
          <User className="w-4 h-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
};

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput = ({ onSend, disabled, placeholder = "Type your response..." }: ChatInputProps) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded-full border-border focus:ring-2 focus:ring-primary/20"
      />
      <Button
        type="submit"
        disabled={disabled || !input.trim()}
        size="icon"
        className="rounded-full bg-gradient-to-br from-primary to-accent hover:opacity-90 transition-all hover:scale-105 active:scale-95 shadow-md"
      >
        <Send className="w-4 h-4" />
      </Button>
    </form>
  );
};

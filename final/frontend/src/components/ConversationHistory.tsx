import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Trash2, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface Conversation {
  id: string;
  title: string | null;
  diagnosis: string | null;
  updated_at: string;
}

interface ConversationHistoryProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onEditTitle: (id: string, newTitle: string) => void;
}

export const ConversationHistory = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onEditTitle,
}: ConversationHistoryProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  return (
    <Card className="h-full flex flex-col">
      <div className="p-4 border-b">
        <Button
          onClick={onNewConversation}
          className="w-full"
          variant="default"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Conversation
        </Button>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group relative p-3 rounded-lg border cursor-pointer transition-all duration-200 ease-out transform ${
                currentConversationId === conv.id
                  ? "bg-gradient-to-r from-primary/10 to-accent/10 border-transparent shadow-lg scale-[1.01]"
                  : "hover:bg-accent"
              }`}
              onClick={() => onSelectConversation(conv.id)}
            >
              {/* active indicator */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r-md transition-colors ${currentConversationId === conv.id ? 'bg-primary' : 'bg-transparent'}`} />
              <div className="flex items-start gap-3 pl-3">
                <MessageSquare className="w-4 h-4 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                        {conv.diagnosis || "Ongoing Diagnosis..."}
                      </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
};
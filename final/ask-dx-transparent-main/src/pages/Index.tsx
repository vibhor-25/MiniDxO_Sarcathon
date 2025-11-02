import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { QuickResponses } from "@/components/QuickResponses";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import { ConversationHistory } from "@/components/ConversationHistory";
import { Activity, AlertCircle, LogOut, Menu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { User } from "@supabase/supabase-js";

interface Message {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  reference?: {
    source: string;
    text: string;
  };
}

interface Conversation {
  id: string;
  title: string | null;
  diagnosis: string | null;
  confidence: number;
  updated_at: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [quickResponses, setQuickResponses] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [diagnosis, setDiagnosis] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [expectingFollowUp, setExpectingFollowUp] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const API_URL = "http://localhost:4000/api/message";

  useEffect(() => {
    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadConversations(session.user.id);
      } else {
        navigate("/auth");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadConversations = async (userId: string) => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading conversations", description: error.message, variant: "destructive" });
    } else if (data) {
      setConversations(data);
      if (data.length > 0 && !currentConversationId) {
        selectConversation(data[0].id);
      } else if (data.length === 0) {
        // Create first conversation for new users
        createNewConversation();
      }
    }
  };

  const selectConversation = async (conversationId: string) => {
    setCurrentConversationId(conversationId);
    const conv = conversations.find(c => c.id === conversationId);
    if (conv) {
      setConfidence(conv.confidence);
      setDiagnosis(conv.diagnosis || undefined);
    }

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Error loading messages", description: error.message, variant: "destructive" });
    } else if (data) {
      setMessages(data.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        reasoning: m.reasoning || undefined,
        reference: m.reference ? JSON.parse(m.reference) : undefined,
      })));
    }
  };

  const createNewConversation = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: null })
      .select()
      .single();

    if (error) {
      toast({ title: "Error creating conversation", description: error.message, variant: "destructive" });
    } else if (data) {
      setConversations(prev => [data, ...prev]);
      setCurrentConversationId(data.id);
      setMessages([{
        role: "assistant",
        content: "Hello! I'm MiniDxO, your transparent AI diagnostic assistant. I'll help understand your symptoms by asking questions step-by-step. What symptoms are you experiencing today?",
        reasoning: "Starting with an open-ended question to gather initial symptom information from the patient."
      }]);
      setConfidence(0);
      setDiagnosis(undefined);
      setQuickResponses([]);

      // Save initial message
      await supabase.from("messages").insert({
        conversation_id: data.id,
        role: "assistant",
        content: "Hello! I'm MiniDxO, your transparent AI diagnostic assistant. I'll help understand your symptoms by asking questions step-by-step. What symptoms are you experiencing today?",
        reasoning: "Starting with an open-ended question to gather initial symptom information from the patient."
      });
    }
  };

  const deleteConversation = async (conversationId: string) => {
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (error) {
      toast({ title: "Error deleting conversation", description: error.message, variant: "destructive" });
    } else {
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        const remaining = conversations.filter(c => c.id !== conversationId);
        if (remaining.length > 0) {
          selectConversation(remaining[0].id);
        } else {
          createNewConversation();
        }
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const simulateDiagnosticReasoning = async (userMessage: string) => {
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    const messageCount = messages.length;
    let aiResponse: Message;
    let newQuickResponses: string[] = [];
    let newConfidence = confidence;
    let newDiagnosis = diagnosis;

    const lowerMessage = userMessage.toLowerCase();

    if (messageCount === 1) {
      if (lowerMessage.includes("fever") || lowerMessage.includes("sore throat") || lowerMessage.includes("cough")) {
        aiResponse = {
          role: "assistant",
          content: "I see you're experiencing some upper respiratory symptoms. Let me gather more information. Do you have a fever? If yes, how high?",
          reasoning: "The patient mentioned symptoms consistent with upper respiratory infection. Need to determine severity through fever assessment to narrow differential diagnosis between viral URI, strep throat, or flu.",
        };
        newQuickResponses = ["Yes, around 100-101°F", "Yes, above 102°F", "No fever", "Not sure"];
        newConfidence = 25;
      } else {
        aiResponse = {
          role: "assistant",
          content: "Thank you for sharing. To help me understand better, can you describe when these symptoms started and their severity?",
          reasoning: "Need temporal information and severity assessment to establish timeline and urgency of condition.",
        };
        newQuickResponses = ["Started yesterday", "Started a few days ago", "Been going on for a week"];
        newConfidence = 15;
      }
    } else if (messageCount === 3) {
      if (lowerMessage.includes("yes") || lowerMessage.includes("102") || lowerMessage.includes("100")) {
        aiResponse = {
          role: "assistant",
          content: "A fever is present. Now, do you have white patches or spots in your throat?",
          reasoning: "High fever combined with sore throat raises suspicion for bacterial pharyngitis (strep throat). White patches/exudate would be a key differentiating feature from viral pharyngitis.",
          reference: {
            source: "Mayo Clinic",
            text: "White patches or streaks of pus on the tonsils are a common sign of strep throat, along with fever and difficulty swallowing."
          }
        };
        newQuickResponses = ["Yes, white patches visible", "No white patches", "Not sure"];
        newConfidence = 50;
      } else {
        aiResponse = {
          role: "assistant",
          content: "Without fever, this is more likely a mild viral infection. Do you have a runny nose or congestion?",
          reasoning: "Absence of fever lowers probability of bacterial infection. Rhinorrhea suggests viral upper respiratory infection.",
        };
        newQuickResponses = ["Yes, very congested", "Slight runny nose", "No"];
        newConfidence = 40;
      }
    } else if (messageCount === 5) {
      if (lowerMessage.includes("white") || lowerMessage.includes("yes")) {
        aiResponse = {
          role: "assistant",
          content: "Based on your symptoms - fever, sore throat, and white patches - you most likely have Strep Throat (streptococcal pharyngitis). This is a bacterial infection requiring antibiotics. I recommend seeing a healthcare provider for a rapid strep test and treatment.",
          reasoning: "Clinical presentation of high fever (>100°F), pharyngitis, and tonsillar exudate creates a high probability for Group A Streptococcus infection (Centor criteria score 3-4). This requires antibiotic therapy to prevent complications like rheumatic fever.",
          reference: {
            source: "CDC Guidelines",
            text: "Strep throat is diagnosed based on symptoms and confirmed with rapid antigen test. Treatment with antibiotics reduces symptom duration and prevents complications."
          }
        };
        newConfidence = 78;
        newDiagnosis = "Strep Throat (Streptococcal Pharyngitis)";
        newQuickResponses = [];
        toast({ title: "Diagnosis Complete", description: "The diagnostic process has concluded with a probable diagnosis." });
      } else {
        aiResponse = {
          role: "assistant",
          content: "Your symptoms suggest a Common Cold (viral upper respiratory infection). This typically resolves on its own with rest, fluids, and over-the-counter symptom relief. Monitor for worsening symptoms.",
          reasoning: "Symptoms of sore throat and nasal congestion without high fever or bacterial indicators point to viral URI. These are self-limiting and don't require antibiotics.",
          reference: {
            source: "NIH MedlinePlus",
            text: "The common cold is caused by viruses and typically improves within 7-10 days. Treatment focuses on symptom management."
          }
        };
        newConfidence = 72;
        newDiagnosis = "Common Cold (Viral URI)";
        newQuickResponses = [];
        toast({ title: "Diagnosis Complete", description: "The diagnostic process has concluded with a probable diagnosis." });
      }
    } else {
      aiResponse = {
        role: "assistant",
        content: "Thank you for the additional information. Let me ask another question to refine the diagnosis...",
        reasoning: "Continuing to gather information to increase diagnostic confidence.",
      };
      newQuickResponses = ["Yes", "No", "Not sure"];
      newConfidence = Math.min(confidence + 10, 65);
    }

    // Save AI message to database
    if (currentConversationId) {
      await supabase.from("messages").insert({
        conversation_id: currentConversationId,
        role: "assistant",
        content: aiResponse.content,
        reasoning: aiResponse.reasoning,
        reference: aiResponse.reference ? JSON.stringify(aiResponse.reference) : null,
      });

      // Update conversation with new diagnosis and confidence
      await supabase
        .from("conversations")
        .update({ diagnosis: newDiagnosis, confidence: newConfidence })
        .eq("id", currentConversationId);
    }

    setMessages(prev => [...prev, aiResponse]);
    setQuickResponses(newQuickResponses);
    setConfidence(newConfidence);
    setDiagnosis(newDiagnosis);
    setIsProcessing(false);
  };

  const sendMessageToBackend = async (content: string, answeredFollowUpFlag: boolean) => {
    setIsProcessing(true);
    try {
      const historyPayload = messages.map(m => ({ role: m.role, text: m.content }));

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history: historyPayload, answered_follow_up: answeredFollowUpFlag }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const data = await res.json();

      if (data.type === "follow_up") {
        const assistantMsg: Message = {
          role: "assistant",
          content: data.assistant_text,
          reasoning: data.rationale || undefined,
        };

        setMessages(prev => [...prev, assistantMsg]);
        setQuickResponses([]);
        setExpectingFollowUp(true); // Next user reply should be sent with answered_follow_up = true

        // persist assistant message
        if (currentConversationId) {
          await supabase.from("messages").insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: assistantMsg.content,
            reasoning: assistantMsg.reasoning,
          });
        }
      } else if (data.type === "diagnosis") {
        const assistantMsg: Message = {
          role: "assistant",
          content: data.assistant_text,
          reasoning: Array.isArray(data.reasoning) ? data.reasoning.join("\n") : undefined,
          reference: data.verifier ? { source: "Verifier", text: data.verifier.supporting_quote } : undefined,
        };

        setMessages(prev => [...prev, assistantMsg]);
        setConfidence(typeof data.confidence === "number" ? data.confidence : 0);
        setDiagnosis(data.diagnosis || undefined);
        setExpectingFollowUp(false);

        if (currentConversationId) {
          await supabase.from("messages").insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: assistantMsg.content,
            reasoning: assistantMsg.reasoning,
            reference: assistantMsg.reference ? JSON.stringify(assistantMsg.reference) : null,
          });

          await supabase
            .from("conversations")
            .update({ diagnosis: data.diagnosis || null, confidence: data.confidence || 0 })
            .eq("id", currentConversationId);
        }

        toast({ title: "Diagnosis received", description: data.assistant_text });
      } else if (data.type === "emergency") {
        const assistantMsg: Message = {
          role: "assistant",
          content: data.assistant_text,
        };

        setMessages(prev => [...prev, assistantMsg]);
        setExpectingFollowUp(false);
        setEmergency(true);

        if (currentConversationId) {
          await supabase.from("messages").insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: assistantMsg.content,
          });
        }
      } else {
        // Unknown type - append as generic assistant text
        const assistantMsg: Message = { role: "assistant", content: data.assistant_text || "" };
        setMessages(prev => [...prev, assistantMsg]);
        if (currentConversationId) {
          await supabase.from("messages").insert({
            conversation_id: currentConversationId,
            role: "assistant",
            content: assistantMsg.content,
          });
        }
      }
    } catch (err: any) {
      // Network or server error - graceful fallback
      toast({ title: "Diagnostic service unavailable", description: "Falling back to local assistant.", variant: "destructive" });
      // Fallback to simulated local reasoning to keep UX responsive
      await simulateDiagnosticReasoning(content);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!currentConversationId) {
      await createNewConversation();
      return;
    }

    const userMessage: Message = { role: "user", content };
    setMessages(prev => [...prev, userMessage]);
    setQuickResponses([]);

    // Save user message to database
    await supabase.from("messages").insert({
      conversation_id: currentConversationId,
      role: "user",
      content,
    });

    // Capture whether this message is answering a follow-up question
    const answeredFlag = expectingFollowUp;

    // If we were expecting a follow-up answer, clear the expectation now (we're sending the answer)
    if (expectingFollowUp) setExpectingFollowUp(false);

    await sendMessageToBackend(content, answeredFlag);
  };

  const handleQuickResponse = (response: string) => {
    handleSendMessage(response);
  };

  const handleEditTitle = async (conversationId: string, newTitle: string) => {
    const { error } = await supabase
      .from("conversations")
      .update({ title: newTitle })
      .eq("id", conversationId);

    if (error) {
      toast({ title: "Error updating title", description: error.message, variant: "destructive" });
    } else {
      setConversations(prev => prev.map(conv => 
        conv.id === conversationId ? { ...conv, title: newTitle } : conv
      ));
      toast({ title: "Title updated", description: "Conversation title has been changed." });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-background">
        <div className="animate-pulse-soft">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-lg border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80">
                  <ConversationHistory
                    conversations={conversations}
                    currentConversationId={currentConversationId}
                    onSelectConversation={selectConversation}
                    onNewConversation={createNewConversation}
                    onDeleteConversation={deleteConversation}
                    onEditTitle={handleEditTitle}
                  />
                </SheetContent>
              </Sheet>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">MiniDxO</h1>
                <p className="text-xs text-muted-foreground">Transparent AI Diagnostician</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="hidden lg:block">
            <ConversationHistory
              conversations={conversations}
              currentConversationId={currentConversationId}
              onSelectConversation={selectConversation}
              onNewConversation={createNewConversation}
              onDeleteConversation={deleteConversation}
              onEditTitle={handleEditTitle}
            />
          </div>

          <div className="lg:col-span-2 flex flex-col h-[calc(100vh-180px)]">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
              {messages.map((message, index) => (
                <ChatMessage 
                  key={index} 
                  role={message.role === "assistant" ? "ai" : "user"} 
                  content={message.content}
                  reasoning={message.reasoning}
                  reference={message.reference}
                />
              ))}
              {isProcessing && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md">
                    <Activity className="w-4 h-4 text-white animate-pulse-soft" />
                  </div>
                  <div className="bg-card text-card-foreground border border-border rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {emergency && (
              <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
                <strong className="block">Emergency detected</strong>
                <p className="text-sm">The assistant detected possible emergency signs. Please seek immediate medical attention or contact emergency services. Further input is disabled.</p>
              </div>
            )}

            {quickResponses.length > 0 && (
              <div className="mb-4">
                <QuickResponses responses={quickResponses} onSelect={handleQuickResponse} disabled={isProcessing || emergency} />
              </div>
            )}

            <ChatInput
              onSend={handleSendMessage}
              disabled={isProcessing || emergency}
              placeholder={isProcessing ? "AI is thinking..." : emergency ? "Input disabled due to emergency" : "Type your response..."}
            />
          </div>

          <div className="space-y-4">
            <DiagnosticProgress confidence={confidence} diagnosis={diagnosis} />
            <div className="bg-accent/10 rounded-xl p-4 border border-accent/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-accent mb-1">Important Notice</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This is a demonstration system for educational purposes only. Always consult a qualified healthcare professional for medical advice.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
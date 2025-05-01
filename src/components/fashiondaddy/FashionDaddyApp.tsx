'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import ChatInterface from './ChatInterface';
import FashionDaddySidebar from './FashionDaddySidebar';
import { WardrobeItem } from './WardrobeCollection'; // Import WardrobeItem type
import { Button } from '@/components/ui/button';
import { PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock data types
export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
  imageUrl?: string; // Optional image URL for AI suggestions
}

export interface ChatSession {
  id: string;
  title: string;
  lastUpdated: number;
  messages: ChatMessage[];
}

// Mock API functions (replace with actual API calls)
const fetchChatHistory = async (): Promise<ChatSession[]> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  // Return dummy data
  return [
    { id: 'session1', title: 'Casual Weekend Outfit', lastUpdated: Date.now() - 3600000, messages: [ { id: 'msg1', sender: 'user', text: 'Need help with a casual weekend look', timestamp: Date.now() - 3700000 }, { id: 'msg2', sender: 'ai', text: 'Sure! How about jeans and a nice sweater?', timestamp: Date.now() - 3650000 }] },
    { id: 'session2', title: 'Formal Event Attire', lastUpdated: Date.now() - 86400000, messages: [ { id: 'msg3', sender: 'user', text: 'I have a black-tie event coming up.', timestamp: Date.now() - 86500000 }, { id: 'msg4', sender: 'ai', text: 'Let\'s find the perfect tuxedo or gown.', timestamp: Date.now() - 86450000 }] },
  ];
};

const fetchWardrobe = async (): Promise<WardrobeItem[]> => {
   await new Promise(resolve => setTimeout(resolve, 600));
    return [
        { id: 'wardrobe1', name: 'Blue Denim Jeans', category: 'Pants', color: 'Blue', imageUrl: 'https://picsum.photos/200/300?random=10', lastWorn: '2024-05-10', purchaseDate: '2023-01-15' },
        { id: 'wardrobe2', name: 'White T-Shirt', category: 'Top', color: 'White', imageUrl: 'https://picsum.photos/200/300?random=11', lastWorn: '2024-05-15', purchaseDate: '2022-08-20' },
        { id: 'wardrobe3', name: 'Black Blazer', category: 'Outerwear', color: 'Black', imageUrl: 'https://picsum.photos/200/300?random=12', lastWorn: '2024-04-20', purchaseDate: '2023-03-01' },
        { id: 'wardrobe4', name: 'Floral Sundress', category: 'Dress', color: 'Multi', imageUrl: 'https://picsum.photos/200/300?random=13', lastWorn: '2024-05-01', purchaseDate: '2023-06-10' },
    ];
}


const FashionDaddyApp: React.FC = () => {
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingWardrobe, setIsLoadingWardrobe] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Default to open

  useEffect(() => {
    const loadData = async () => {
      setIsLoadingHistory(true);
      setIsLoadingWardrobe(true);
      try {
        const [historyData, wardrobeData] = await Promise.all([
            fetchChatHistory(),
            fetchWardrobe()
        ]);
        setChatHistory(historyData);
        setWardrobeItems(wardrobeData);
        // Optionally select the most recent chat by default
        if (historyData.length > 0) {
           // setCurrentChat(historyData.sort((a, b) => b.lastUpdated - a.lastUpdated)[0]);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        // Handle error display in UI if needed
      } finally {
        setIsLoadingHistory(false);
        setIsLoadingWardrobe(false);
      }
    };
    loadData();
  }, []);

  const handleSelectChat = (sessionId: string) => {
    const selected = chatHistory.find(session => session.id === sessionId);
    setCurrentChat(selected || null);
    // Close sidebar on mobile when a chat is selected
    if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
    }
  };

  const handleNewChat = () => {
     console.log("Creating new chat...");
     const newSession: ChatSession = {
         id: `session${Date.now()}`, // Simple unique ID
         title: 'New Chat',
         lastUpdated: Date.now(),
         messages: [],
     };
     setChatHistory([newSession, ...chatHistory]);
     setCurrentChat(newSession);
     // Close sidebar on mobile when new chat is created
     if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
    }
  };

  const handleSendMessage = async (messageText: string): Promise<void> => {
    if (!currentChat) return; // Or handle creating a new chat if none is selected

    const userMessage: ChatMessage = {
        id: `msg${Date.now()}`,
        sender: 'user',
        text: messageText,
        timestamp: Date.now(),
    };

    // Update the current chat locally immediately
    const updatedMessages = [...currentChat.messages, userMessage];
    const updatedChat = { ...currentChat, messages: updatedMessages, lastUpdated: Date.now() };
    setCurrentChat(updatedChat);

    // Update the chat history list
    setChatHistory(prevHistory =>
        prevHistory.map(session =>
            session.id === updatedChat.id ? updatedChat : session
        ).sort((a, b) => b.lastUpdated - a.lastUpdated) // Keep sorted by recent
    );

     // --- Placeholder for sending message to AI and getting response ---
     console.log("Sending message to AI:", messageText);
     // Simulate AI response delay
     await new Promise(resolve => setTimeout(resolve, 1500));

     const aiResponse: ChatMessage = {
         id: `msg${Date.now() + 1}`, // Ensure unique ID
         sender: 'ai',
         text: `AI response to: "${messageText}". Here's a suggestion...`,
         timestamp: Date.now(),
          // Example of including an image
         imageUrl: Math.random() > 0.7 ? 'https://picsum.photos/300/200?random=' + Date.now() : undefined,
     };

     // Update chat with AI response
     const finalMessages = [...updatedMessages, aiResponse];
     const finalChat = { ...updatedChat, messages: finalMessages, lastUpdated: Date.now() };
     setCurrentChat(finalChat);

     // Update history again with the AI message
     setChatHistory(prevHistory =>
        prevHistory.map(session =>
            session.id === finalChat.id ? finalChat : session
        ).sort((a, b) => b.lastUpdated - a.lastUpdated)
    );
     // --- End Placeholder ---
  };

  const handleReferenceItem = (item: WardrobeItem) => {
      console.log("Referencing item:", item.name);
      const messageText = `Tell me more about styling my ${item.name}.`;
       if (!currentChat) {
         handleNewChat(); // Create a new chat if none exists
         setTimeout(() => handleSendMessage(messageText), 100); // Needs refinement
       } else {
           handleSendMessage(messageText);
       }
       // Close sidebar on mobile when item is referenced
       if (window.innerWidth < 768) {
          setIsSidebarOpen(false);
       }
  };


  return (
    <div className="relative flex h-[calc(100vh-12rem)] max-h-[800px] w-full overflow-hidden rounded-lg border bg-card shadow-lg">
       {/* Sidebar */}
       <FashionDaddySidebar
          chatHistory={chatHistory}
          wardrobeItems={wardrobeItems}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onReferenceItem={handleReferenceItem}
          isLoadingHistory={isLoadingHistory}
          isLoadingWardrobe={isLoadingWardrobe}
          currentChatId={currentChat?.id}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />

      {/* Main Chat Area */}
       <div className="flex flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out">
            {/* Open Sidebar Button (visible when closed on desktop or mobile) */}
             {!isSidebarOpen && (
                 <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarOpen(true)}
                    className="absolute left-2 top-2 z-20 h-8 w-8 md:hidden" // Specific to mobile
                    aria-label="Open sidebar"
                 >
                     <PanelLeftOpen size={18} />
                 </Button>
             )}
             {!isSidebarOpen && (
                 <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarOpen(true)}
                    className="absolute left-2 top-2 z-20 hidden h-8 w-8 md:block" // Specific to desktop
                    aria-label="Open sidebar"
                 >
                     <PanelLeftOpen size={18} />
                 </Button>
             )}


          {currentChat ? (
            <ChatInterface
              messages={currentChat.messages}
              onSendMessage={handleSendMessage}
              isLoading={false} // Add loading state if AI response is pending
            />
          ) : (
            <div className="flex h-full flex-1 items-center justify-center bg-muted/30 p-4 text-center">
              <p className="text-muted-foreground">Select a chat from the sidebar or start a new one.</p>
            </div>
          )}
      </div>
    </div>
  );
};

export default FashionDaddyApp;

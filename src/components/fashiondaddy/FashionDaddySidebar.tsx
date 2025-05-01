'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { PanelLeftClose } from 'lucide-react'; // Keep PanelLeftOpen in the parent
import { MessageSquare, Shirt, PlusCircle } from 'lucide-react';
import { ChatSession } from './FashionDaddyApp'; // Assuming type is defined here
import ChatHistoryList from './ChatHistoryList';
import WardrobeCollection, { WardrobeItem } from './WardrobeCollection';
import { cn } from '@/lib/utils';

interface FashionDaddySidebarProps {
  chatHistory: ChatSession[];
  wardrobeItems: WardrobeItem[];
  onSelectChat: (sessionId: string) => void;
  onNewChat: () => void;
  onReferenceItem: (item: WardrobeItem) => void;
  isLoadingHistory: boolean;
  isLoadingWardrobe: boolean;
  currentChatId?: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

const FashionDaddySidebar: React.FC<FashionDaddySidebarProps> = ({
  chatHistory,
  wardrobeItems,
  onSelectChat,
  onNewChat,
  onReferenceItem,
  isLoadingHistory,
  isLoadingWardrobe,
  currentChatId,
  isOpen,
  onToggle,
}) => {
  return (
      // Use absolute positioning on mobile, relative on desktop.
      // Control visibility and width with `cn` based on `isOpen`.
      // Added flex-shrink-0 to prevent shrinking issues.
      <div className={cn(
          "absolute left-0 top-0 z-30 flex h-full flex-col border-r bg-secondary/50 transition-transform duration-300 ease-in-out md:relative md:flex-shrink-0",
           isOpen ? 'translate-x-0 w-full md:w-80' : '-translate-x-full w-full md:w-0 md:-translate-x-0 md:border-none' // Slide out on mobile, shrink on desktop
      )}>
         {/* Ensure content inside sidebar is visible/hidden based on isOpen state */}
        <div className={cn("flex h-full flex-col overflow-hidden", !isOpen && 'hidden md:hidden')}>
            <div className="flex items-center justify-between p-2 border-b">
                <Button variant="ghost" size="sm" onClick={onNewChat} className="flex items-center gap-1 shrink-0">
                    <PlusCircle size={16} /> New Chat
                </Button>
                {/* Toggle Button always visible when sidebar is open */}
                <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7 shrink-0">
                    <PanelLeftClose size={18} />
                    <span className="sr-only">Close Sidebar</span>
                </Button>
            </div>

            <Tabs defaultValue="history" className="flex flex-1 flex-col overflow-hidden">
                <TabsList className="grid w-full grid-cols-2 rounded-none border-b shrink-0">
                    <TabsTrigger value="history" className="rounded-none data-[state=active]:shadow-none">
                         <MessageSquare className="mr-2 h-4 w-4" /> History
                     </TabsTrigger>
                    <TabsTrigger value="wardrobe" className="rounded-none data-[state=active]:shadow-none">
                        <Shirt className="mr-2 h-4 w-4" /> Wardrobe
                     </TabsTrigger>
                </TabsList>

                 <ScrollArea className="flex-1">
                    <TabsContent value="history" className="mt-0 p-2">
                        <ChatHistoryList
                            sessions={chatHistory}
                            onSelectChat={onSelectChat}
                            isLoading={isLoadingHistory}
                            currentChatId={currentChatId}
                        />
                    </TabsContent>
                    <TabsContent value="wardrobe" className="mt-0 p-2">
                        <WardrobeCollection
                            items={wardrobeItems}
                            onReferenceItem={onReferenceItem}
                            isLoading={isLoadingWardrobe}
                        />
                    </TabsContent>
                 </ScrollArea>
            </Tabs>
        </div>
    </div>
  );
};

export default FashionDaddySidebar;

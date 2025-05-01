'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ChatSession } from './FashionDaddyApp'; // Assuming type is defined here

interface ChatHistoryListProps {
  sessions: ChatSession[];
  onSelectChat: (sessionId: string) => void;
  isLoading: boolean;
  currentChatId?: string | null;
}

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({ sessions, onSelectChat, isLoading, currentChatId }) => {

  const getRelativeTime = (timestamp: number): string => {
     try {
        return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
     } catch (e) {
        console.error("Error formatting date:", e);
        return "Invalid date";
     }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col space-y-1 rounded-md border p-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground text-center p-4">No chat history yet.</p>;
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <Button
          key={session.id}
          variant="ghost"
          onClick={() => onSelectChat(session.id)}
          className={cn(
            "h-auto w-full justify-start rounded-md border p-2 text-left transition-colors hover:bg-accent",
            currentChatId === session.id ? "bg-accent border-primary" : "border-transparent"
          )}
        >
          <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{session.title}</span>
              <span className="text-xs text-muted-foreground">
                  Last updated: {getRelativeTime(session.lastUpdated)}
              </span>
          </div>
        </Button>
      ))}
    </div>
  );
};

export default ChatHistoryList;

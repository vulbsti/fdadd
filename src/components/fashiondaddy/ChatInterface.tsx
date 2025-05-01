'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, User, Bot } from 'lucide-react';
import { ChatMessage } from './FashionDaddyApp'; // Assuming type is defined here
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  isLoading: boolean; // To show loading indicator for AI response
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [inputValue, setInputValue] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleSend = async () => {
    if (inputValue.trim() === '') return;
    const messageToSend = inputValue;
    setInputValue(''); // Clear input immediately
    await onSendMessage(messageToSend);
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  // Scroll to bottom when new messages arrive or loading starts/stops
  useEffect(() => {
    if (viewportRef.current) {
        // Use setTimeout to allow the DOM to update before scrolling
        setTimeout(() => {
             if (viewportRef.current) {
                viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
             }
        }, 100);
    }
  }, [messages, isLoading]);


  return (
    <div className="flex h-full flex-col bg-card">
      {/* Message Display Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
         <div ref={viewportRef} className="h-full space-y-4">
            {messages.map((message) => (
            <div
                key={message.id}
                className={cn(
                'flex items-end gap-2 animate-in fade-in duration-300',
                message.sender === 'user' ? 'justify-end' : 'justify-start'
                )}
            >
                {message.sender === 'ai' && (
                <Avatar className="h-8 w-8">
                    <AvatarFallback><Bot size={18} /></AvatarFallback>
                </Avatar>
                )}
                <div
                className={cn(
                    'max-w-[75%] rounded-lg px-3 py-2 shadow-sm',
                    message.sender === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                )}
                >
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    {message.imageUrl && (
                      <div className="mt-2">
                        <Image
                          src={message.imageUrl}
                          alt="AI suggestion"
                          width={300}
                          height={200}
                          className="rounded-md object-cover"
                          data-ai-hint="fashion item suggestion"
                        />
                      </div>
                    )}
                </div>
                 {message.sender === 'user' && (
                <Avatar className="h-8 w-8">
                     <AvatarFallback><User size={18} /></AvatarFallback>
                </Avatar>
                )}
            </div>
            ))}
             {isLoading && (
                <div className="flex items-end gap-2 justify-start animate-pulse">
                     <Avatar className="h-8 w-8">
                         <AvatarFallback><Bot size={18} /></AvatarFallback>
                     </Avatar>
                     <div className="max-w-[75%] rounded-lg px-3 py-2 shadow-sm bg-secondary">
                         <Skeleton className="h-4 w-16" />
                     </div>
                </div>
            )}
          </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="relative flex items-center">
          <Input
            type="text"
            placeholder="Ask FashionDaddy..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            className="pr-12 text-base md:text-sm"
            disabled={isLoading}
            aria-label="Chat input"
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={handleSend}
            disabled={isLoading || inputValue.trim() === ''}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;

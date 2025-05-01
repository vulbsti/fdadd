'use client';

import React from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from 'lucide-react';

export interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  color: string;
  imageUrl: string;
  lastWorn?: string; // Optional
  purchaseDate?: string; // Optional
}

interface WardrobeCollectionProps {
  items: WardrobeItem[];
  onReferenceItem: (item: WardrobeItem) => void;
  isLoading: boolean;
}

const WardrobeCollection: React.FC<WardrobeCollectionProps> = ({ items, onReferenceItem, isLoading }) => {

  if (isLoading) {
    return (
       <div className="grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => (
           <Card key={i} className="animate-pulse">
             <CardContent className="p-2 space-y-1">
                <Skeleton className="h-24 w-full rounded-md" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
            </CardContent>
           </Card>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center p-4">Your wardrobe is empty.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <Card key={item.id} className="group relative overflow-hidden transition-shadow hover:shadow-md">
          <CardContent className="p-0">
             <Image
                src={item.imageUrl}
                alt={item.name}
                width={200}
                height={300}
                className="h-32 w-full object-cover transition-transform group-hover:scale-105"
                 data-ai-hint={`${item.category} ${item.color}`}
              />
             <div className="p-2">
                <p className="truncate text-xs font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.category}</p>
             </div>
             <Button
                variant="outline"
                size="icon"
                className="absolute bottom-1 right-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 bg-background/80 hover:bg-background"
                onClick={() => onReferenceItem(item)}
                title={`Reference ${item.name} in chat`}
              >
                <Info size={12} />
             </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default WardrobeCollection;

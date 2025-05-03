// filepath: /home/utka/proj/t_pro/fdadd/src/app/api/rss/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchRssFeeds } from '@/services/rss';

// API route to fetch RSS feeds
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    
    const feeds = await fetchRssFeeds();
    
    // Filter by source if provided
    if (source) {
      const filteredFeeds = feeds.filter(item => 
        item.source.toLowerCase() === source.toLowerCase()
      );
      return NextResponse.json(filteredFeeds);
    }
    
    return NextResponse.json(feeds);
  } catch (error) {
    console.error('Error fetching RSS feeds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch RSS feeds' },
      { status: 500 }
    );
  }
}

// API route to add a new RSS feed source
export async function POST(request: NextRequest) {
  try {
    const { url, source } = await request.json();
    
    if (!url || !source) {
      return NextResponse.json(
        { error: 'URL and source name are required' },
        { status: 400 }
      );
    }
    
    // In a real implementation, we would save this to a database
    // For now, we'll just return a success message
    
    return NextResponse.json(
      { message: 'RSS feed added successfully', url, source },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}

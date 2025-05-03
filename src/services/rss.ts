// filepath: /home/utka/proj/t_pro/fdadd/src/services/rss.ts

/**
 * Represents an RSS feed item from external sources like Substack or Medium
 */
export interface RssFeedItem {
  id: string;
  title: string;
  link: string;
  date: string;
  summary: string;
  source: string;
  imageUrl?: string;
}

// Default RSS feeds to fetch
const RSS_FEEDS = [
  { url: 'https://example-feed.substack.com/feed', source: 'Substack' },
  { url: 'https://medium.com/feed/@example-user', source: 'Medium' },
];

/**
 * Fetches and parses RSS feeds from different sources
 */
export async function fetchRssFeeds(feeds = RSS_FEEDS): Promise<RssFeedItem[]> {
  try {
    // In production, we would use a proper RSS parser library
    // For now, use a mock implementation for development
    return mockRssItems;
  } catch (error) {
    console.error('Failed to fetch RSS feeds:', error);
    return [];
  }
}

/**
 * Convert RSS feed items to a format compatible with our blog posts
 */
export function rssToBlogPost(rssItem: RssFeedItem): Partial<import('./blog').BlogPost> {
  return {
    id: `rss-${rssItem.id}`,
    title: rssItem.title,
    excerpt: rssItem.summary,
    content: rssItem.summary,
    date: rssItem.date,
    author: rssItem.source,
    imageUrl: rssItem.imageUrl,
    source: rssItem.source,
  };
}

// Mock RSS feed items for development
const mockRssItems: RssFeedItem[] = [
  {
    id: 'substack-1',
    title: 'Fashion Trends for Summer 2025',
    link: 'https://example.com/fashion-trends-2025',
    date: '2025-04-25',
    summary: 'Discover the hottest fashion trends for the upcoming summer season. From bold colors to sustainable materials, we cover everything you need to know.',
    source: 'Fashion Substack',
    imageUrl: 'https://picsum.photos/seed/substack1/600/400',
  },
  {
    id: 'medium-1',
    title: 'The Psychology of Fashion Choices',
    link: 'https://example.com/psychology-fashion',
    date: '2025-04-20',
    summary: 'An exploration of how our fashion choices reflect our inner psychology and impact how others perceive us in social situations.',
    source: 'Fashion Medium',
    imageUrl: 'https://picsum.photos/seed/medium1/600/400',
  },
];

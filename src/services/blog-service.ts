/**
 * Blog Service - Handles data fetching and management for the blog feature
 */
export interface BlogPost {
  /**
   * Unique identifier for the blog post
   */
  id: string;
  /**
   * Title of the blog post
   */
  title: string;
  /**
   * Short summary of the blog post content
   */
  excerpt: string;
  /**
   * Full content of the blog post
   */
  content: string;
  /**
   * Publication date in ISO format (YYYY-MM-DD)
   */
  date: string;
  /**
   * Author of the blog post
   */
  author: string;
  /**
   * URL to the featured image
   */
  imageUrl?: string;
  /**
   * Source of the blog post ('internal', 'cms', 'rss', etc.)
   */
  source?: string;
  /**
   * Optional tags/categories for the blog post
   */
  tags?: string[];
  /**
   * Optional URL for external posts
   */
  externalUrl?: string;
}

// In-memory store for development - would be replaced with a database in production
let blogPostsData: BlogPost[] = [
  {
    id: '1',
    title: 'Mastering Minimalist Fashion in 2024',
    excerpt: 'Discover the secrets to curating a chic and timeless minimalist wardrobe. Less is truly more.',
    content: 'Minimalism continues to be a powerful trend in fashion. It\'s about investing in high-quality, versatile pieces that you love and will wear for years to come. Think neutral color palettes, clean lines, and impeccable tailoring. Start by decluttering your existing wardrobe and identifying the core items you truly need...',
    date: '2024-05-15',
    author: 'Style Savant',
    imageUrl: 'https://picsum.photos/seed/blog1/600/400',
    source: 'internal',
    tags: ['minimalism', 'fashion-trends', 'wardrobe-essentials']
  },
  {
    id: '2',
    title: 'The Rise of Sustainable Luxury Brands',
    excerpt: 'Explore how luxury fashion is embracing sustainability without compromising on style or quality.',
    content: 'Consumers are increasingly demanding transparency and ethical practices from fashion brands, and the luxury sector is responding. From innovative materials like mushroom leather to circular business models, discover the brands leading the charge towards a more sustainable future for high fashion...',
    date: '2024-05-08',
    author: 'Eco Chic',
    imageUrl: 'https://picsum.photos/seed/blog2/600/400',
    source: 'internal',
    tags: ['sustainability', 'luxury', 'ethical-fashion']
  },
  {
    id: '3',
    title: 'AI in Fashion: Beyond Personal Styling',
    excerpt: 'How artificial intelligence is revolutionizing everything from design and manufacturing to trend forecasting.',
    content: 'While personal styling apps are becoming common, AI\'s impact on fashion runs much deeper. Algorithms are now assisting designers in creating patterns, optimizing supply chains to reduce waste, and predicting the next big trends with remarkable accuracy. Explore the technological advancements shaping the industry...',
    date: '2024-04-29',
    author: 'Tech Threads',
    imageUrl: 'https://picsum.photos/seed/blog3/600/400',
    source: 'internal',
    tags: ['technology', 'ai', 'fashion-tech']
  },
  {
    id: '4',
    title: 'Accessorizing 101: Elevate Any Outfit',
    excerpt: 'Learn the art of choosing the perfect accessories to complete your look and express your personality.',
    content: 'Accessories are the exclamation point of an outfit. The right scarf, bag, or piece of jewelry can transform a simple ensemble into something truly special. We cover the basics, from understanding scale and proportion to mixing metals and textures effectively...',
    date: '2024-04-15',
    author: 'Accessorize Me',
    imageUrl: 'https://picsum.photos/seed/blog4/600/400',
    source: 'internal',
    tags: ['accessories', 'styling-tips', 'fashion-basics']
  },
];

// RSS Feed Integration
interface RssFeed {
  url: string;
  source: string;
}

interface RssFeedItem {
  id: string;
  title: string;
  link: string;
  date: string;
  summary: string;
  source: string;
  imageUrl?: string;
}

// Default RSS feeds to fetch
const RSS_FEEDS: RssFeed[] = [
  { url: 'https://example-fashion.substack.com/feed', source: 'Fashion Substack' },
  { url: 'https://medium.com/feed/@fashion-example', source: 'Fashion Medium' },
];

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

/**
 * Fetches RSS feeds from configured sources
 */
async function fetchRssFeeds(feeds = RSS_FEEDS): Promise<RssFeedItem[]> {
  try {
    // In production, we would use a proper RSS parser library
    // For development, return mock data
    return mockRssItems;
  } catch (error) {
    console.error('Failed to fetch RSS feeds:', error);
    return [];
  }
}

/**
 * Converts RSS items to BlogPost format
 */
function rssToBlogPost(rssItem: RssFeedItem): BlogPost {
  return {
    id: `rss-${rssItem.id}`,
    title: rssItem.title,
    excerpt: rssItem.summary,
    content: rssItem.summary,
    date: rssItem.date,
    author: rssItem.source,
    imageUrl: rssItem.imageUrl,
    source: 'rss',
    externalUrl: rssItem.link
  };
}

/**
 * Retrieves all blog posts, optionally including RSS feed items
 */
export async function getAllBlogPosts(options: {
  includeRss?: boolean;
  source?: string;
  tag?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{
  posts: BlogPost[];
  total: number;
  page: number;
  totalPages: number;
}> {
  try {
    const {
      includeRss = true,
      source,
      tag,
      page = 1,
      limit = 10
    } = options;

    // Get internal blog posts
    let allPosts = [...blogPostsData];

    // Add RSS feed items if enabled
    if (includeRss) {
      const rssItems = await fetchRssFeeds();
      const rssPosts = rssItems.map(rssToBlogPost);
      allPosts = [...allPosts, ...rssPosts];
    }

    // Filter by source if specified
    if (source && source !== 'all') {
      allPosts = allPosts.filter(post => post.source === source);
    }

    // Filter by tag if specified
    if (tag) {
      allPosts = allPosts.filter(post => post.tags?.includes(tag));
    }

    // Sort by date (newest first)
    allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate pagination
    const total = allPosts.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedPosts = allPosts.slice(startIndex, startIndex + limit);

    return {
      posts: paginatedPosts,
      total,
      page,
      totalPages
    };
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return {
      posts: blogPostsData,
      total: blogPostsData.length,
      page: 1,
      totalPages: 1
    };
  }
}

/**
 * Retrieves a single blog post by ID
 */
export async function getBlogPostById(id: string): Promise<BlogPost | null> {
  try {
    // Check internal posts first
    const internalPost = blogPostsData.find(post => post.id === id);
    if (internalPost) return internalPost;

    // Check if it's an RSS post
    if (id.startsWith('rss-')) {
      const rssItems = await fetchRssFeeds();
      const rssId = id.replace('rss-', '');
      const rssItem = rssItems.find(item => item.id === rssId);
      
      if (rssItem) {
        return rssToBlogPost(rssItem);
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return null;
  }
}

/**
 * Creates a new blog post
 */
export function createBlogPost(post: Omit<BlogPost, 'id'>): BlogPost {
  const newPost: BlogPost = {
    ...post,
    id: `post-${Date.now()}`,
    date: post.date || new Date().toISOString().split('T')[0],
    source: post.source || 'cms'
  };

  blogPostsData.push(newPost);
  return newPost;
}

/**
 * Updates an existing blog post
 */
export function updateBlogPost(id: string, updatedPost: Partial<BlogPost>): BlogPost | null {
  const index = blogPostsData.findIndex(post => post.id === id);
  
  if (index === -1) {
    return null;
  }

  blogPostsData[index] = { ...blogPostsData[index], ...updatedPost };
  return blogPostsData[index];
}

/**
 * Deletes a blog post
 */
export function deleteBlogPost(id: string): boolean {
  const initialLength = blogPostsData.length;
  blogPostsData = blogPostsData.filter(post => post.id !== id);
  return blogPostsData.length < initialLength;
}

/**
 * Gets all available tags from blog posts
 */
export function getAllTags(): string[] {
  const tagsSet = new Set<string>();
  
  blogPostsData.forEach(post => {
    post.tags?.forEach(tag => {
      tagsSet.add(tag);
    });
  });
  
  return Array.from(tagsSet);
}

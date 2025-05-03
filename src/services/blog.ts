/**
 * Represents a blog post with title, excerpt, content, and other metadata.
 */
export interface BlogPost {
  /**
   * The unique identifier for the blog post.
   */
  id: string;
  /**
   * The title of the blog post.
   */
  title: string;
  /**
   * A short summary or preview of the blog post content.
   */
  excerpt: string;
  /**
   * The full content of the blog post, which can include text, images, etc.
   */
  content: string;
  /**
   * The date when the blog post was published.
   */
  date: string;
  /**
   * The author of the blog post.
   */
  author: string;
  /**
   * URL of the featured image.
   */
  imageUrl?: string;
  /**
   * Source of the blog post (internal, rss, etc.)
   */
  source?: string;
}

/**
 * Service for managing blog content from multiple sources:
 * - Local static data
 * - CMS API (to be implemented)
 * - RSS feeds (implemented partially)
 */

import { fetchRssFeeds, rssToBlogPost, RssFeedItem } from './rss';

// Use a consistent seed for predictability if desired, or remove for randomness
const blogPostsData: BlogPost[] = [
    {
      id: '1',
      title: 'Mastering Minimalist Fashion in 2024',
      excerpt: 'Discover the secrets to curating a chic and timeless minimalist wardrobe. Less is truly more.',
      content: 'Minimalism continues to be a powerful trend in fashion. It\'s about investing in high-quality, versatile pieces that you love and will wear for years to come. Think neutral color palettes, clean lines, and impeccable tailoring. Start by decluttering your existing wardrobe and identifying the core items you truly need...',
      date: '2024-05-15',
      author: 'Style Savant',
      imageUrl: 'https://picsum.photos/seed/blog1/600/400',
      source: 'internal',
    },
    {
      id: '2',
      title: 'The Rise of Sustainable Luxury Brands',
      excerpt: 'Explore how luxury fashion is embracing sustainability without compromising on style or quality.',
      content: 'Consumers are increasingly demanding transparency and ethical practices from fashion brands, and the luxury sector is responding. From innovative materials like mushroom leather to circular business models, discover the brands leading the charge towards a more sustainable future for high fashion...',
      date: '2024-05-08',
      author: 'Eco Chic',
      imageUrl: 'https://picsum.photos/seed/blog2/600/400',
    },
     {
      id: '3',
      title: 'AI in Fashion: Beyond Personal Styling',
      excerpt: 'How artificial intelligence is revolutionizing everything from design and manufacturing to trend forecasting.',
      content: 'While personal styling apps are becoming common, AI\'s impact on fashion runs much deeper. Algorithms are now assisting designers in creating patterns, optimizing supply chains to reduce waste, and predicting the next big trends with remarkable accuracy. Explore the technological advancements shaping the industry...',
      date: '2024-04-29',
      author: 'Tech Threads',
      imageUrl: 'https://picsum.photos/seed/blog3/600/400',
    },
     {
      id: '4',
      title: 'Accessorizing 101: Elevate Any Outfit',
      excerpt: 'Learn the art of choosing the perfect accessories to complete your look and express your personality.',
      content: 'Accessories are the exclamation point of an outfit. The right scarf, bag, or piece of jewelry can transform a simple ensemble into something truly special. We cover the basics, from understanding scale and proportion to mixing metals and textures effectively...',
      date: '2024-04-15',
      author: 'Accessorize Me',
      imageUrl: 'https://picsum.photos/seed/blog4/600/400',
    },
  ];


/**
 * Asynchronously retrieves a list of blog posts from multiple sources.
 * Combines internal blog posts with RSS feed items.
 *
 * @param includeRss Whether to include RSS feed items (default: true)
 * @returns A promise that resolves to an array of BlogPost objects.
 */
export async function getBlogPosts(includeRss: boolean = true): Promise<BlogPost[]> {
  try {
    // Start with internal blog posts
    let allPosts = [...blogPostsData];
    
    // Add RSS feed items if enabled
    if (includeRss) {
      const rssItems = await fetchRssFeeds();
      const rssPosts = rssItems.map(item => rssToBlogPost(item) as BlogPost);
      allPosts = [...allPosts, ...rssPosts];
    }
    
    // Sort by date (newest first)
    allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return allPosts;
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return blogPostsData; // Fallback to static data
  }
}

/**
 * Asynchronously retrieves a single blog post by its ID from any source.
 * Handles both internal posts and RSS-sourced content.
 *
 * @param id The ID of the blog post to retrieve.
 * @returns A promise that resolves to a BlogPost object, or null if not found.
 */
export async function getBlogPost(id: string): Promise<BlogPost | null> {
  try {
    // Check internal posts first
    const internalPost = blogPostsData.find((post) => post.id === id);
    if (internalPost) return internalPost;
    
    // Check if it's an RSS post (starts with 'rss-')
    if (id.startsWith('rss-')) {
      const rssItems = await fetchRssFeeds();
      const rssId = id.replace('rss-', '');
      const rssItem = rssItems.find(item => item.id === rssId);
      
      if (rssItem) {
        return rssToBlogPost(rssItem) as BlogPost;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return null;
  }
}

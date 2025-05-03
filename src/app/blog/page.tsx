import { getBlogPosts } from '@/services/blog';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { Suspense } from 'react';

// Simple loading component
function LoadingPosts() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="border rounded-lg p-4 h-64 animate-pulse">
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
}

// Update the page component to handle Next.js 15
export default async function BlogPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> | undefined
}) {
  // Need to await searchParams in Next.js 15
  const resolvedSearchParams = searchParams ? await searchParams : {};
  
  // Get filter parameter for source (internal, rss, or all)
  const sourceParam = resolvedSearchParams.source;
  const sourceFilter = typeof sourceParam === 'string' ? sourceParam : 'all';
  
  // Fetch posts (includeRss parameter based on filter)
  const includeRss = sourceFilter === 'all' || sourceFilter === 'rss';
  const posts = await getBlogPosts(includeRss);
  
  // Filter posts if needed
  const filteredPosts = sourceFilter === 'all' 
    ? posts 
    : posts.filter(post => post.source === sourceFilter);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <h1 className="text-4xl font-bold text-center md:text-left">Aidoraa Blog</h1>
        
        {/* Source filter tabs */}
        <div className="flex space-x-4 mt-4 md:mt-0 justify-center md:justify-end">
          <a 
            href="/blog"
            className={`px-3 py-1 rounded-full ${sourceFilter === 'all' ? 'bg-primary text-white' : 'bg-gray-100'}`}
          >
            All
          </a>
          <a 
            href="/blog?source=internal"
            className={`px-3 py-1 rounded-full ${sourceFilter === 'internal' ? 'bg-primary text-white' : 'bg-gray-100'}`}
          >
            Our Posts
          </a>
          <a 
            href="/blog?source=rss"
            className={`px-3 py-1 rounded-full ${sourceFilter === 'rss' ? 'bg-primary text-white' : 'bg-gray-100'}`}
          >
            RSS Feeds
          </a>
        </div>
      </div>

      <Suspense fallback={<LoadingPosts />}>
        {filteredPosts.length === 0 ? (
          <p className="text-center text-muted-foreground">No blog posts found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPosts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </Suspense>
    </div>
  );
}

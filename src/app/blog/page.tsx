import { getBlogPosts } from '@/services/blog';
import { BlogPostCard } from '@/components/blog/BlogPostCard';

export default async function BlogPage() {
  const posts = await getBlogPosts(); // Fetch all posts

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8 text-center">Aidoraa Blog</h1>
       {posts.length === 0 ? (
         <p className="text-center text-muted-foreground">No blog posts found.</p>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           {posts.map((post) => (
             <BlogPostCard key={post.id} post={post} />
           ))}
         </div>
       )}
        {/* TODO: Add pagination or infinite scroll if needed */}
    </div>
  );
}

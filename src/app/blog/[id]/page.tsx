import { getBlogPost, getBlogPosts } from '@/services/blog';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, ExternalLink } from 'lucide-react';

// Define the params type for Next.js 15
export type BlogPageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> | undefined;
};

// Generate static paths for internal blog posts
export async function generateStaticParams() {
  // Only include internal posts in static generation
  const posts = await getBlogPosts(false);
  return posts.map((post) => ({
    id: post.id,
  }));
}

export default async function BlogPostPage({ params, searchParams }: BlogPageParams) {
  // Await params in Next.js 15
  const { id } = await params;
  // Also await searchParams if needed
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const post = await getBlogPost(id);
  
  if (!post) {
    notFound();
  }

  const formattedDate = format(new Date(post.date), 'MMMM d, yyyy');
  const isRssPost = post.id.startsWith('rss-');

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
         <div className="mb-4 flex items-center gap-2">
            {post.source && (
              <Badge variant="secondary">{post.source}</Badge>
            )}
            {isRssPost && (
              <Badge variant="outline" className="flex items-center gap-1">
                <ExternalLink size={12} /> External Source
              </Badge>
            )}
         </div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl font-serif">
          {post.title}
        </h1>
         <div className="flex items-center space-x-3 text-sm text-muted-foreground">
           <div className="flex items-center gap-2">
             <Avatar className="h-6 w-6">
               <AvatarFallback><User size={14}/></AvatarFallback>
             </Avatar>
             <span>{post.author}</span>
           </div>
           <span>·</span>
           <time dateTime={post.date}>{formattedDate}</time>
         </div>
      </header>

      {/* Display banner for RSS content */}
      {post.id.startsWith('rss-') && (
        <div className="mb-8 p-4 bg-gray-100 rounded-lg">
          <p className="text-sm text-muted-foreground flex items-center">
            <ExternalLink size={16} className="mr-2" />
            This content is from an external source. You can 
            <Link href={`https://example.com/redirect?to=${encodeURIComponent(post.id.replace('rss-', ''))}`} 
                  className="text-primary mx-1 underline">
              view the original article
            </Link>
            for the complete content.
          </p>
        </div>
      )}

      {post.imageUrl && (
        <div className="relative mb-8 h-64 w-full overflow-hidden rounded-lg md:h-96">
          <Image
            src={post.imageUrl.startsWith('https://picsum.photos') ? post.imageUrl : `https://picsum.photos/1200/800?random=${id}` } // Ensure picsum is used for placeholders
            alt={post.title}
            fill // Use fill instead of layout
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" // Example sizes, adjust as needed
            style={{ objectFit: 'cover' }} // Use style object for objectFit
            priority // Prioritize loading the main image
            data-ai-hint="fashion blog post image"
          />
        </div>
      )}

      {/* Using prose for styling markdown content - requires @tailwindcss/typography */}
      <div className="prose prose-lg dark:prose-invert max-w-none">
        {/* Render excerpt as intro paragraph */}
        <p className="font-medium text-xl">{post.excerpt}</p>
        
        {/* For internal posts, show full content */}
        {!post.id.startsWith('rss-') ? (
          <>
            <p>{post.content}</p>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
            <Image
                src={`https://picsum.photos/800/500?random=${parseInt(id, 10)+10}`} // Ensure base 10 parsing
                alt="Supporting blog image"
                width={800}
                height={500}
                className="rounded-lg my-6"
                data-ai-hint="fashion detail lifestyle"
             />
            <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida.</p>
          </>
        ) : (
          <>
            <p>{post.content}</p>
            {/* Call-to-action for RSS content */}
            <div className="mt-8 p-6 bg-gray-100 rounded-lg text-center">
              <p className="mb-4">Continue reading the full article on the original platform.</p>
              <Link 
                href={`https://example.com/redirect?to=${encodeURIComponent(post.id.replace('rss-', ''))}`}
                className="bg-primary text-white px-6 py-2 rounded-lg inline-flex items-center"
              >
                Read Full Article <ExternalLink size={16} className="ml-2" />
              </Link>
            </div>
          </>
        )}
      </div>

       {/* TODO: Add social sharing buttons if needed */}
    </article>
  );
}

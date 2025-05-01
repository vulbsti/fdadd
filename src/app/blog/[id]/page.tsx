import { getBlogPost, getBlogPosts } from '@/services/blog';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

// Define the expected props structure for the page
type Props = {
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
};

// Generate static paths for blog posts
export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({
    id: post.id,
  }));
}


export default async function BlogPostPage({ params }: Props) { // Use the defined Props type
  const post = await getBlogPost(params.id);

  if (!post) {
    notFound();
  }

  const formattedDate = format(new Date(post.date), 'MMMM d, yyyy');

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
         <div className="mb-4">
            {/* TODO: Add category badges if available */}
            {/* <Badge variant="secondary">Fashion Trends</Badge> */}
         </div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl font-serif">
          {post.title}
        </h1>
         <div className="flex items-center space-x-3 text-sm text-muted-foreground">
           <div className="flex items-center gap-2">
             <Avatar className="h-6 w-6">
               {/* Add author image if available */}
               <AvatarFallback><User size={14}/></AvatarFallback>
             </Avatar>
             <span>{post.author}</span>
           </div>
           <span>·</span>
           <time dateTime={post.date}>{formattedDate}</time>
         </div>
      </header>

      {post.imageUrl && (
        <div className="relative mb-8 h-64 w-full overflow-hidden rounded-lg md:h-96">
          <Image
            src={post.imageUrl.startsWith('https://picsum.photos') ? post.imageUrl : `https://picsum.photos/1200/800?random=${params.id}` } // Ensure picsum is used for placeholders
            alt={post.title}
            layout="fill"
            objectFit="cover"
            priority // Prioritize loading the main image
            data-ai-hint="fashion blog post image"
          />
        </div>
      )}

      {/* Using prose for styling markdown content - requires @tailwindcss/typography */}
      {/* Add @tailwindcss/typography plugin if needed, or style manually */}
       <div className="prose prose-lg dark:prose-invert max-w-none">
           <p>{post.excerpt}</p>
           {/* Render full post.content here. This often involves a Markdown renderer */}
            <p>{post.content}</p>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
             <Image
                 src={`https://picsum.photos/800/500?random=${parseInt(params.id, 10)+10}`} // Ensure base 10 parsing
                 alt="Supporting blog image"
                 width={800}
                 height={500}
                 className="rounded-lg my-6"
                 data-ai-hint="fashion detail lifestyle"
              />
            <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida.</p>
       </div>

       {/* TODO: Add social sharing buttons if needed */}
    </article>
  );
}

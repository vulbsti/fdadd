import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BlogPost } from '@/services/blog'; // Assuming type is defined here
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';

interface BlogPostCardProps {
  post: BlogPost;
}

export function BlogPostCard({ post }: BlogPostCardProps) {
   const formattedDate = format(new Date(post.date), 'MMM d, yyyy');
   // Use picsum for placeholder images if default paths are used
   const imageUrl = post.imageUrl === '/images/blog1.jpg' || post.imageUrl === '/images/blog2.jpg'
     ? `https://picsum.photos/600/400?random=${post.id}`
     : post.imageUrl;


  return (
    <Card className="flex flex-col overflow-hidden transition-shadow duration-300 hover:shadow-xl">
      <Link href={`/blog/${post.id}`} className="block">
         <Image
            src={imageUrl}
            alt={post.title}
            width={600}
            height={400}
            className="h-48 w-full object-cover"
             data-ai-hint="fashion blog lifestyle"
          />
      </Link>
      <CardHeader>
        <Link href={`/blog/${post.id}`} className="block">
           <CardTitle className="text-xl hover:text-primary transition-colors">{post.title}</CardTitle>
        </Link>
        <CardDescription>
          By {post.author} on {formattedDate}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-sm text-muted-foreground line-clamp-3">{post.excerpt}</p>
      </CardContent>
      <CardFooter>
         <Button asChild variant="link" className="p-0 text-sm">
            <Link href={`/blog/${post.id}`}>Read More <ArrowRight className="ml-1" size={16} /></Link>
         </Button>
      </CardFooter>
    </Card>
  );
}

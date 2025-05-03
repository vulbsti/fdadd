import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BlogPost } from '@/services/blog-service';
import { format } from 'date-fns';
import { ArrowRight, ExternalLink, Calendar, User, Tag } from 'lucide-react';

interface BlogPostCardProps {
  post: BlogPost;
}

export function BlogPostCard({ post }: BlogPostCardProps) {
  const formattedDate = format(new Date(post.date), 'MMM d, yyyy');
  
  // Generate image URL or use the provided one
  const imageUrl = post.imageUrl || `https://picsum.photos/600/400?random=${post.id}`;
    
  // Check if this is an external RSS post
  const isRssPost = post.source === 'rss';
  const isExternal = Boolean(post.externalUrl);
  
  // Determine the link destination
  const postLink = isExternal && post.externalUrl 
    ? post.externalUrl
    : `/blog/${post.id}`;

  return (
    <Card className="flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl group relative h-full">
      {/* Source badge */}
      <div className="absolute top-2 left-2 z-10 flex gap-1">
        {post.source && (
          <Badge 
            variant={isRssPost ? "outline" : "secondary"}
            className="flex items-center gap-1"
          >
            {isRssPost && <ExternalLink size={12} />}
            {post.source}
          </Badge>
        )}
      </div>
      
      {/* Featured Image */}
      <Link 
        href={postLink} 
        target={isExternal ? "_blank" : undefined} 
        className="block overflow-hidden"
      >
        <div className="h-48 w-full overflow-hidden">
          <Image
            src={imageUrl}
            alt={post.title}
            width={600}
            height={400}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      </Link>

      {/* Content */}
      <CardHeader className="pb-2">
        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {post.tags.slice(0, 2).map(tag => (
              <Badge variant="outline" key={tag} className="text-xs">
                <Tag className="mr-1 h-3 w-3" />
                {tag}
              </Badge>
            ))}
            {post.tags.length > 2 && (
              <Badge variant="outline" className="text-xs">+{post.tags.length - 2}</Badge>
            )}
          </div>
        )}
        
        {/* Title */}
        <Link 
          href={postLink}
          target={isExternal ? "_blank" : undefined}
          className="block"
        >
          <CardTitle className="text-xl hover:text-primary transition-colors line-clamp-2">
            {post.title}
            {isExternal && (
              <ExternalLink size={14} className="inline-block ml-1 opacity-50" />
            )}
          </CardTitle>
        </Link>
        
        {/* Author & Date */}
        <CardDescription className="flex items-center gap-4 text-sm">
          <span className="flex items-center">
            <User className="mr-1 h-3 w-3" /> 
            {post.author}
          </span>
          <span className="flex items-center">
            <Calendar className="mr-1 h-3 w-3" /> 
            {formattedDate}
          </span>
        </CardDescription>
      </CardHeader>
      
      {/* Excerpt */}
      <CardContent className="pb-2 flex-grow">
        <p className="text-sm text-muted-foreground line-clamp-3">{post.excerpt}</p>
      </CardContent>
      
      {/* Footer */}
      <CardFooter className="pt-0">
        <Button 
          asChild 
          variant="link" 
          className="p-0 text-sm hover:text-primary"
          aria-label={`Read more about ${post.title}`}
        >
          <Link 
            href={postLink}
            target={isExternal ? "_blank" : undefined}
            className="flex items-center"
          >
            Read More 
            {isExternal ? (
              <ExternalLink className="ml-1" size={16} />
            ) : (
              <ArrowRight className="ml-1" size={16} />
            )}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

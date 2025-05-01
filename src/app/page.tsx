import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { getBlogPosts } from '@/services/blog'; // Assuming blog service exists

export default async function Home() {
  const latestPosts = (await getBlogPosts()).slice(0, 2); // Get latest 2 posts

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative h-[70vh] w-full overflow-hidden bg-gradient-to-b from-background via-secondary/30 to-background">
         <Image
            src="https://picsum.photos/1600/900"
            alt="Elegant fashion model"
            layout="fill"
            objectFit="cover"
            quality={85}
            className="opacity-30"
            data-ai-hint="elegant fashion model"
          />
        <div className="container relative z-10 mx-auto flex h-full flex-col items-center justify-center px-4 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
            Discover Your Style with Aidoraa AI
          </h1>
          <p className="mb-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Experience the future of fashion with our intelligent styling tools. Personalized advice and planning, just for you.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/fashiondaddy">Try FashionDaddy <ArrowRight className="ml-2" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dateplanner">Plan Your Date</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Our AI Fashion Tools
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-xl">
             <Image
                src="https://picsum.photos/600/400?random=1"
                alt="FashionDaddy AI Chat"
                width={600}
                height={400}
                className="h-48 w-full object-cover"
                data-ai-hint="AI chat interface fashion"
              />
            <CardHeader>
              <CardTitle className="text-2xl">FashionDaddy</CardTitle>
              <CardDescription>Your personal AI stylist. Get fashion advice, outfit suggestions, and wardrobe management.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="p-0">
                <Link href="/fashiondaddy">Explore FashionDaddy <ArrowRight className="ml-1" size={16} /></Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-xl">
            <Image
                src="https://picsum.photos/600/400?random=2"
                alt="DatePlanner AI Tool"
                width={600}
                height={400}
                className="h-48 w-full object-cover"
                data-ai-hint="couple romantic date outfit planning"
              />
            <CardHeader>
              <CardTitle className="text-2xl">DatePlanner</CardTitle>
              <CardDescription>Let AI help you plan the perfect date night, from outfits to venues.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="p-0">
                <Link href="/dateplanner">Try DatePlanner <ArrowRight className="ml-1" size={16} /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Blog Snippets Section */}
      {latestPosts.length > 0 && (
        <section className="bg-secondary/50 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Latest from the Blog
            </h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {latestPosts.map((post) => (
                <BlogPostCard key={post.id} post={post} />
              ))}
            </div>
            <div className="mt-12 text-center">
              <Button asChild variant="outline">
                <Link href="/blog">View All Posts</Link>
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

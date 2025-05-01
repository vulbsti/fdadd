import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Palette } from 'lucide-react'; // Added Palette icon
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { getBlogPosts } from '@/services/blog';

export default async function Home() {
  const latestPosts = (await getBlogPosts()).slice(0, 3); // Get latest 3 posts

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative h-[70vh] w-full overflow-hidden bg-gradient-to-b from-background via-secondary/30 to-background">
         <Image
            src="https://picsum.photos/seed/hero/1600/900"
            alt="Elegant fashion scene"
            layout="fill"
            objectFit="cover"
            quality={85}
            className="opacity-20" // Slightly adjusted opacity for better contrast with new theme
            data-ai-hint="elegant fashion runway soft focus"
            priority // Prioritize loading hero image
          />
        <div className="container relative z-10 mx-auto flex h-full flex-col items-center justify-center px-4 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground md:text-6xl font-serif">
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
                <Link href="/aesthetic-quiz">Find Your Aesthetic <Palette className="ml-2" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl font-serif">
          Our AI Fashion Tools
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3"> {/* Changed to 3 columns */}
          <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-xl">
             <Image
                src="https://picsum.photos/seed/feat1/600/400"
                alt="FashionDaddy AI Chat"
                width={600}
                height={400}
                className="h-48 w-full object-cover"
                data-ai-hint="AI chat interface fashion elegant"
              />
            <CardHeader>
              <CardTitle className="text-2xl font-serif">FashionDaddy</CardTitle>
              <CardDescription>Your personal AI stylist. Get fashion advice and outfit suggestions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="p-0">
                <Link href="/fashiondaddy">Explore FashionDaddy <ArrowRight className="ml-1" size={16} /></Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-xl">
            <Image
                src="https://picsum.photos/seed/feat2/600/400"
                alt="DatePlanner AI Tool"
                width={600}
                height={400}
                className="h-48 w-full object-cover"
                data-ai-hint="couple romantic date elegant outfit planning"
              />
            <CardHeader>
              <CardTitle className="text-2xl font-serif">DatePlanner</CardTitle>
              <CardDescription>Let AI help you plan the perfect date night, from outfits to venues.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="p-0">
                <Link href="/dateplanner">Try DatePlanner <ArrowRight className="ml-1" size={16} /></Link>
              </Button>
            </CardContent>
          </Card>
           {/* New Card for Aesthetic Quiz */}
          <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-xl">
            <Image
                src="https://picsum.photos/seed/feat3/600/400"
                alt="Fashion Aesthetic Quiz"
                width={600}
                height={400}
                className="h-48 w-full object-cover"
                data-ai-hint="mood board fashion different styles collage"
              />
            <CardHeader>
              <CardTitle className="text-2xl font-serif">Aesthetic Quiz</CardTitle>
              <CardDescription>Uncover your unique fashion personality and style preferences.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="p-0">
                <Link href="/aesthetic-quiz">Take the Quiz <Palette className="ml-1" size={16} /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Blog Snippets Section */}
      {latestPosts.length > 0 && (
        <section className="bg-secondary/50 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl font-serif">
              Latest from the Blog
            </h2>
             {/* Adjust grid columns based on number of posts */}
            <div className={`grid grid-cols-1 gap-8 ${latestPosts.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
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

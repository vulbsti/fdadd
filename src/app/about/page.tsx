import Image from 'next/image';

export default function AboutPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
       <h1 className="text-4xl font-bold mb-8 text-center">About Aidoraa</h1>

       <div className="relative mb-12 h-64 w-full overflow-hidden rounded-lg md:h-80">
          <Image
            src="https://picsum.photos/1200/600?random=about"
            alt="Fashion design studio"
            layout="fill"
            objectFit="cover"
            data-ai-hint="modern fashion design studio team"
          />
       </div>

       <div className="prose prose-lg dark:prose-invert max-w-none space-y-6">
          <h2 className="text-3xl font-semibold">Our Mission</h2>
          <p>
            At Aidoraa, we believe that fashion is a powerful form of self-expression. Our mission is to empower individuals to discover and refine their personal style using the cutting edge of artificial intelligence. We aim to make personalized fashion advice accessible, intuitive, and inspiring for everyone.
          </p>

          <h2 className="text-3xl font-semibold">The Future of Fashion AI</h2>
          <p>
            We are passionate about the intersection of technology and creativity. Aidoraa leverages sophisticated AI algorithms, trained on vast datasets of fashion trends, styles, and user preferences, to provide unparalleled styling assistance. From the conversational FashionDaddy AI to the meticulous DatePlanner, our tools are designed to seamlessly integrate into your life, helping you look and feel your best.
          </p>
           <p>
            We are constantly innovating, exploring new ways AI can enhance the fashion experience – from virtual try-ons to sustainable sourcing recommendations. Join us on this exciting journey as we redefine personal style in the digital age.
           </p>

           <h2 className="text-3xl font-semibold">Meet the Team (Placeholder)</h2>
           <p>
            Aidoraa was founded by a diverse team of fashion enthusiasts, AI researchers, and software engineers dedicated to building the next generation of fashion technology. (More details about the team would go here).
           </p>

       </div>
    </div>
  );
}

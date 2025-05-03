// Define basic types that work across platforms
declare namespace Blog {
  // Blog data interfaces
  interface Post {
    id: string;
    title: string;
    excerpt: string;
    content: string;
    date: string;
    author: string;
    imageUrl?: string;
  }
  
  // Feed data interface
  interface FeedItem {
    id: string;
    title: string;
    link: string;
    date: string;
    summary: string;
    source: string;
  }
}

// Define custom page props globally or in a specific namespace
declare global { // Or use a custom namespace like `namespace MyApp { ... }`
    interface CommonPageProps {
        params: any;
        searchParams?: any;
    }
}

// Special types for Firebase and Vercel
declare module 'firebase-nextjs-compat' {
  interface FirebasePageProps {
    params: any;
    searchParams?: any;
  }
}

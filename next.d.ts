declare namespace Blog {
  interface Post {
    id: string;
    title: string;
    excerpt: string;
    content: string;
    date: string;
    author: string;
    imageUrl?: string;
  }
  
  interface FeedItem {
    id: string;
    title: string;
    link: string;
    date: string;
    summary: string;
    source: string;
  }
}

declare global {
    interface CommonPageProps {
        params: any;
        searchParams?: any;
    }
}


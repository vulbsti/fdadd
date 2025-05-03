import { NextRequest, NextResponse } from 'next/server';
import { getAllBlogPosts, createBlogPost } from '@/services/blog-service';

// GET handler for listing blog posts with filters
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters for listing posts
    const source = searchParams.get('source') || undefined;
    const tag = searchParams.get('tag') || undefined;
    const includeRss = searchParams.get('includeRss') !== 'false'; // Default to true
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    // Get blog posts with filters
    const result = await getAllBlogPosts({
      includeRss,
      source,
      tag,
      page,
      limit
    });
    
    // Return paginated result
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in blog API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST handler for creating a new blog post
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const postData = await request.json();
    
    // Validate required fields
    if (!postData.title || !postData.content || !postData.author) {
      return NextResponse.json(
        { error: 'Missing required fields: title, content, author' },
        { status: 400 }
      );
    }
    
    // Create excerpt if not provided
    if (!postData.excerpt) {
      postData.excerpt = postData.content.substring(0, 150) + '...';
    }
    
    // Create the post
    const newPost = createBlogPost(postData);
    
    return NextResponse.json(newPost, { status: 201 });
  } catch (error) {
    console.error('Error creating blog post:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
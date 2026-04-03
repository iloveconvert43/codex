export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import PostPageClient from './PostPageClient'

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { data: post } = await supabase
      .from('posts')
      .select('content, image_url, is_mystery, is_anonymous, user:users(display_name, username)')
      .eq('id', params.id)
      .single()

    if (!post) return { title: 'Post | tryHushly' }

    const isAnon = post.is_anonymous
    const author = isAnon ? 'Anonymous' : ((post.user as any)?.display_name || (post.user as any)?.username || 'Someone')
    const content = post.is_mystery ? '🎭 Mystery post — tap to reveal' : (post.content || '')
    const title = `${author} on tryHushly`

    return {
      title,
      description: content.slice(0, 150),
      openGraph: {
        title,
        description: content.slice(0, 200),
        images: post.image_url ? [{ url: post.image_url }] : [],
        siteName: 'tryHushly' } }
  } catch {
    return { title: 'Post | tryHushly' }
  }
}

export default function PostPage({ params }: { params: { id: string } }) {
  return <PostPageClient id={params.id} />
}

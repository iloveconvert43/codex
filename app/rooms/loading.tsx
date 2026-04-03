import FeedSkeleton from '@/components/feed/FeedSkeleton'

export default function Loading() {
  return (
    <div className="flex flex-col gap-0.5 pt-2">
      {[...Array(4)].map((_, i) => <FeedSkeleton key={i} />)}
    </div>
  )
}

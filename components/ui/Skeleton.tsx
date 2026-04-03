import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      'bg-gradient-to-r from-bg-card via-bg-card2 to-bg-card bg-[length:200%_100%] animate-shimmer rounded-xl',
      className
    )} />
  )
}

export function PostSkeleton() {
  return (
    <div className="glass-card p-4 mb-3 mx-4">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-11/12 mb-2" />
      <Skeleton className="h-3 w-4/5 mb-4" />
      <div className="flex gap-2 pt-3 border-t border-border">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
    </div>
  )
}

export function FeedSkeleton() {
  return (
    <div className="pt-2">
      <PostSkeleton />
      <PostSkeleton />
      <PostSkeleton />
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="px-4 pt-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="w-18 h-18 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
      <Skeleton className="h-5 w-36 mb-2" />
      <Skeleton className="h-3.5 w-24 mb-3" />
      <Skeleton className="h-3 w-full mb-1" />
      <Skeleton className="h-3 w-4/5 mb-4" />
      <div className="flex gap-8 py-4 border-y border-border">
        {[1,2,3].map(i => (
          <div key={i} className="text-center">
            <Skeleton className="h-5 w-10 mx-auto mb-1" />
            <Skeleton className="h-3 w-10 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CommentSkeleton() {
  return (
    <div className="flex gap-3 py-3 px-4">
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

export function NotificationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    </div>
  )
}

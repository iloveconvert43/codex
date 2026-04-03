'use client'

export default function FeedSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[0,1,2,3].map(i => (
        <div key={i} className="bg-bg-card px-4 py-4"
          style={{ animationDelay: `${i * 0.08}s` }}>
          {/* Avatar + name */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full skeleton-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 skeleton-pulse rounded-full w-28" />
              <div className="h-2.5 skeleton-pulse rounded-full w-20" />
            </div>
          </div>
          {/* Content lines */}
          <div className="space-y-2 mb-3">
            <div className="h-3 skeleton-pulse rounded-full w-full" />
            <div className="h-3 skeleton-pulse rounded-full w-5/6" />
            <div className="h-3 skeleton-pulse rounded-full w-3/5" />
          </div>
          {/* Actions */}
          <div className="flex gap-6 mt-3">
            <div className="h-3 skeleton-pulse rounded-full w-10" />
            <div className="h-3 skeleton-pulse rounded-full w-10" />
            <div className="h-3 skeleton-pulse rounded-full w-10" />
          </div>
        </div>
      ))}
    </div>
  )
}

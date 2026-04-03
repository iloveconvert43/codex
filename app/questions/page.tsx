'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, MessageCircle, Send, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
const fetcher = swrFetcher
import { useAuth } from '@/hooks/useAuth'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import Avatar from '@/components/ui/Avatar'
import { getRelativeTime } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function QuestionsPage() {
  const { isLoggedIn, loading, profile } = useAuth()
  const [showAnswered, setShowAnswered] = useState(false)
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data, mutate, isLoading } = useSWR(
    isLoggedIn ? `/api/qa?answered=${showAnswered}` : null,
    fetcher,
    { refreshInterval: 30000 }
  )

  const questions: any[] = (data as any)?.data ?? []
  const unansweredCount: number = (data as any)?.unansweredCount ?? 0

  async function handleAnswer(questionId: string) {
    if (!answerText.trim()) { toast.error('Write an answer first'); return }
    setSubmitting(true)
    try {
      const res = await api.post(`/api/qa/answer/${questionId}`, { answer_text: answerText }, { requireAuth: true })
      toast.success('Answer posted! 🎉')
      setAnsweringId(null)
      setAnswerText('')
      mutate()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setSubmitting(false) }
  }

  if (!loading && !isLoggedIn) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🤫</div>
          <h2 className="text-xl font-bold mb-2">Anonymous Questions</h2>
          <p className="text-text-secondary text-sm mb-5">Sign in to see questions people sent you</p>
          <Link href="/login" className="btn-primary">Sign In</Link>
        </div>
      </div>
    )
  }

  const Inner = (
    <div className="max-w-lg mx-auto px-4 py-4">
      {/* Unanswered count badge */}
      {unansweredCount > 0 && !showAnswered && (
        <div className="bg-primary-muted border border-primary/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <span className="text-primary text-2xl font-bold">{unansweredCount}</span>
          <div>
            <p className="text-sm font-semibold text-primary">Anonymous question{unansweredCount !== 1 ? 's' : ''}</p>
            <p className="text-xs text-text-muted">People are curious about you 👀</p>
          </div>
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowAnswered(false)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
            !showAnswered ? 'bg-primary-muted border-primary text-primary' : 'border-border text-text-secondary'}`}>
          Unanswered
        </button>
        <button onClick={() => setShowAnswered(true)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
            showAnswered ? 'bg-primary-muted border-primary text-primary' : 'border-border text-text-secondary'}`}>
          Answered
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="glass-card p-4 animate-pulse h-20" />)}
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🤫</div>
          <h3 className="font-semibold mb-2">No {showAnswered ? 'answered' : 'unanswered'} questions</h3>
          <p className="text-sm text-text-secondary mb-4">
            {showAnswered ? "You haven't answered any questions yet" : "Share your profile to get anonymous questions"}
          </p>
          {!showAnswered && (
            <button onClick={() => {
              const url = `${window.location.origin}/profile/${profile?.id}`
              navigator.clipboard.writeText(url).then(() => toast.success('Profile link copied!'))
            }} className="btn-primary text-sm">
              Share Profile Link
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q: any) => (
            <div key={q.id} className="glass-card p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-bg-card2 border border-border flex items-center justify-center text-base flex-shrink-0">
                  🕵️
                </div>
                <div className="flex-1">
                  <p className="text-xs text-text-muted mb-1">Anonymous · {getRelativeTime(q.created_at)}</p>
                  <p className="text-sm font-medium leading-relaxed">{q.question_text}</p>
                </div>
              </div>

              {q.is_answered ? (
                <div className="flex items-center gap-1.5 text-xs text-accent-green">
                  <Check size={12} /> Answered
                  {q.answer_post_id && (
                    <Link href={`/post/${q.answer_post_id}`} className="text-primary hover:underline ml-1">
                      View post
                    </Link>
                  )}
                </div>
              ) : answeringId === q.id ? (
                <div className="mt-2">
                  <textarea
                    value={answerText}
                    onChange={e => setAnswerText(e.target.value)}
                    placeholder="Write your answer..."
                    rows={3}
                    maxLength={2000}
                    className="input-base resize-none text-sm w-full"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleAnswer(q.id)} disabled={submitting}
                      className="btn-primary text-sm flex items-center gap-1.5 py-2">
                      {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Post Answer
                    </button>
                    <button onClick={() => { setAnsweringId(null); setAnswerText('') }}
                      className="btn-ghost text-sm py-2">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAnsweringId(q.id)}
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                  <MessageCircle size={12} /> Answer this question
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-xl border-b border-border safe-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/" className="text-text-muted hover:text-text"><ArrowLeft size={22} /></Link>
            <div className="flex items-center gap-2">
              <span className="text-xl">🤫</span>
              <h1 className="font-bold">Anonymous Questions</h1>
            </div>
          </div>
        </div>
        <main className="pb-nav">{Inner}</main>
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto hide-scrollbar border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur-xl border-b border-border px-6 py-3">
            <h1 className="font-bold flex items-center gap-2"><span>🤫</span> Anonymous Questions</h1>
          </div>
          {Inner}
        </main>
      </div>
    </div>
  )
}

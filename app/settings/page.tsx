'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  ArrowLeft, Camera, Save, Lock, Bell, Trash2, UserX,
  ChevronRight, ChevronDown, Globe, Eye, EyeOff,
  Loader2, Moon, Sun, Shield, Check, X
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { api, getErrorMessage, swrFetcher } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import Avatar from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import Link from 'next/link'

const LANGUAGES = ['English','Hindi','Bengali','Tamil','Telugu','Marathi','Gujarati','Kannada','Malayalam','Punjabi','Urdu','Odia','Other']
const RELATIONSHIP_OPTIONS = [
  { value: 'single',          label: 'Single' },
  { value: 'in_relationship', label: 'In a relationship' },
  { value: 'engaged',         label: 'Engaged' },
  { value: 'married',         label: 'Married' },
  { value: 'complicated',     label: "It's complicated" },
  { value: 'open',            label: 'Open relationship' },
  { value: 'widowed',         label: 'Widowed' },
  { value: 'separated',       label: 'Separated' },
  { value: 'divorced',        label: 'Divorced' },
]

function Section({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border rounded-2xl overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <h2 className="font-bold text-sm">{title}</h2>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, children, privacy, onPrivacyToggle }: {
  label: string; children: React.ReactNode
  privacy?: 'public'|'private'; onPrivacyToggle?: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</label>
        {privacy !== undefined && (
          <button onClick={onPrivacyToggle}
            className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all",
              privacy === 'public'
                ? "border-green/40 text-accent-green bg-accent-green/10"
                : "border-border text-text-muted")}>
            {privacy === 'public' ? <><Globe size={9} /> Public</> : <><Lock size={9} /> Private</>}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', maxLength }: {
  value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; maxLength?: number
}) {
  return (
    <div className="relative">
      <input type={type} value={value}
        onChange={e => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
        placeholder={placeholder}
        className="input-base w-full text-sm" />
      {maxLength && value.length > maxLength * 0.8 && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  )
}

function Textarea({ value, onChange, placeholder, maxLength = 160 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number
}) {
  return (
    <div className="relative">
      <textarea value={value}
        onChange={e => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder} rows={3}
        className="input-base w-full text-sm resize-none" />
      <span className="absolute bottom-2 right-3 text-[10px] text-text-muted">{value.length}/{maxLength}</span>
    </div>
  )
}

function SettingsContent() {
  const router = useRouter()
  const { profile, isLoggedIn, refreshProfile, signOut } = useAuth()
  const { theme, toggle: toggleTheme, isDark } = useTheme()
  const [saving, setSaving] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef  = useRef<HTMLInputElement>(null)

  // ── Profile fields ──
  const [displayName, setDisplayName]   = useState('')
  const [username,    setUsername]       = useState('')
  const [bio,         setBio]            = useState('')
  const [pinnedDetail, setPinnedDetail] = useState('')

  // Personal
  const [city,         setCity]         = useState('')
  const [hometown,     setHometown]     = useState('')
  const [dob,          setDob]          = useState('')
  const [gender,       setGender]       = useState('')
  const [pronouns,     setPronouns]     = useState('')
  const [nationality,  setNationality]  = useState('')
  const [relationship, setRelationship] = useState('')
  const [languages,    setLanguages]    = useState<string[]>([])

  // Privacy
  const [isPrivate, setIsPrivate] = useState(false)
  const [privacy, setPrivacy] = useState({
    show_gender: 'private', show_dob: 'private', show_phone: 'private',
    show_nationality: 'public', show_address: 'private'
  })

  // Notifications
  const { data: notifData } = useSWR(
    profile?.id ? '/api/users/notification-prefs' : null, swrFetcher)
  const [notifPrefs, setNotifPrefs] = useState({
    new_follower: true, follow_request: true, new_reaction: true,
    new_comment: true, new_message: true, mystery_revealed: true,
    challenge_reminder: true, new_anonymous_question: true,
    badge_awarded: true, level_up: true, marketing: false })

  useEffect(() => {
    if (!profile) return
    const p = profile as any
    setDisplayName(p.display_name || p.full_name || '')
    setUsername(p.username || '')
    setBio(p.bio || '')
    setPinnedDetail(p.pinned_detail || '')
    setCity(p.city || '')
    setHometown(p.hometown || '')
    setDob(p.dob || '')
    setGender(p.gender || '')
    setPronouns(p.pronouns || '')
    setNationality(p.nationality || '')
    setRelationship(p.relationship_status || '')
    setLanguages(p.languages || [])
    setIsPrivate(p.is_private || false)
    if (p.privacy_settings) setPrivacy(ps => ({ ...ps, ...p.privacy_settings }))
  }, [profile])

  useEffect(() => {
    if (notifData) setNotifPrefs(n => ({ ...n, ...(notifData as any).data }))
  }, [notifData])

  function togglePrivacy(key: string) {
    setPrivacy(p => ({ ...p, [key]: p[key as keyof typeof p] === 'public' ? 'private' : 'public' }))
  }

  function toggleLanguage(lang: string) {
    setLanguages(l => l.includes(lang) ? l.filter(x => x !== lang) : [...l, lang])
  }

  async function uploadPhoto(file: File, type: 'avatar' | 'cover') {
    const toastId = toast.loading(`Uploading ${type}…`)
    try {
      const { uploadToImageKit } = await import('@/lib/upload')
      const uploadType = type === 'avatar' ? 'avatars' : 'covers'
      let fileToUpload = file
      try {
        const { compressImage } = await import('@/lib/media')
        const comp = await compressImage(file, type)
        fileToUpload = comp.file
      } catch { /* use original */ }
      const uploadResult = await uploadToImageKit(fileToUpload, uploadType as any)
      if (!uploadResult?.url) throw new Error('Upload failed')

      await api.patch('/api/users/profile', {
        [type === 'avatar' ? 'avatar_url' : 'cover_url']: uploadResult.url
      }, { requireAuth: true })

      await refreshProfile()
      toast.success(`${type === 'avatar' ? 'Profile photo' : 'Cover photo'} updated!`, { id: toastId })
    } catch (err) {
      toast.error(getErrorMessage(err), { id: toastId })
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await api.patch('/api/users/profile', {
        display_name:        displayName.trim() || null,
        username:            username.trim() || null,
        bio:                 bio.trim() || null,
        pinned_detail:       pinnedDetail.trim() || null,
        city:                city.trim() || null,
        hometown:            hometown.trim() || null,
        dob:                 dob || null,
        gender:              gender || null,
        pronouns:            pronouns.trim() || null,
        nationality:         nationality.trim() || null,
        relationship_status: relationship || null,
        languages:           languages,
        is_private:          isPrivate,
        privacy_settings:    privacy,
      }, { requireAuth: true })

      await refreshProfile()
      toast.success('Profile saved ✓')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveNotifPrefs() {
    try {
      await api.post('/api/users/notification-prefs', notifPrefs, { requireAuth: true })
      toast.success('Notification preferences saved')
    } catch { toast.error('Failed to save') }
  }

  async function handleSignOut() {
    if (!confirm('Sign out?')) return
    await signOut()
  }

  async function handleDeleteAccount() {
    const msg = prompt('Type DELETE to confirm account deletion:')
    if (msg !== 'DELETE') return
    try {
      await api.delete('/api/users/me', { requireAuth: true })
      await supabase.auth.signOut()
      router.replace('/')
    } catch (err) { toast.error(getErrorMessage(err)) }
  }

  if (!isLoggedIn) return (
    <div className="p-8 text-center">
      <p className="text-text-muted mb-4">Sign in to access settings</p>
      <Link href="/login" className="btn-primary">Sign in</Link>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">

      {/* ── Cover + Avatar ── */}
      <div className="relative mb-16 rounded-2xl overflow-visible">
        {/* Cover */}
        <div className="h-28 rounded-2xl bg-gradient-to-br from-primary/40 to-accent-red/30 relative group cursor-pointer"
          onClick={() => coverInputRef.current?.click()}>
          {(profile as any)?.cover_url && (
            <img src={(profile as any).cover_url} className="absolute inset-0 w-full h-full object-cover rounded-2xl" alt="" loading="lazy" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity">
            <div className="flex items-center gap-2 text-white text-xs font-semibold">
              <Camera size={14} /> Edit Cover
            </div>
          </div>
        </div>
        {/* Avatar */}
        <div className="absolute -bottom-10 left-4 group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
          <div className="relative">
            <Avatar user={profile} size={72} className="border-4 border-bg" />
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={16} className="text-white" />
            </div>
          </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0], 'avatar')} />
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0], 'cover')} />
      </div>

      {/* ── Intro ── */}
      <Section title="Intro" emoji="👋">
        <Field label="Display Name">
          <Input value={displayName} onChange={setDisplayName} placeholder="Your name" maxLength={50} />
        </Field>
        <Field label="Username">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-sm">@</span>
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30))}
              placeholder="username" className="input-base w-full pl-8 text-sm" />
          </div>
        </Field>
        <Field label="Bio">
          <Textarea value={bio} onChange={setBio} placeholder="Tell people about yourself…" maxLength={160} />
        </Field>
        <Field label="Pinned detail">
          <Input value={pinnedDetail} onChange={setPinnedDetail}
            placeholder="e.g. Engineer at Google · Kolkata" maxLength={100} />
        </Field>
      </Section>

      {/* ── Personal Details ── */}
      <Section title="Personal Details" emoji="🗂️">
        <Field label="Current City" privacy={privacy.show_address as any} onPrivacyToggle={() => togglePrivacy('show_address')}>
          <Input value={city} onChange={setCity} placeholder="Where do you live?" maxLength={100} />
        </Field>
        <Field label="Hometown">
          <Input value={hometown} onChange={setHometown} placeholder="Where are you from?" maxLength={100} />
        </Field>
        <Field label="Date of Birth" privacy={privacy.show_dob as any} onPrivacyToggle={() => togglePrivacy('show_dob')}>
          <input type="date" value={dob} onChange={e => setDob(e.target.value)}
            max={new Date(Date.now() - 13 * 365.25 * 86400000).toISOString().split('T')[0]}
            className="input-base w-full text-sm" />
        </Field>
        <Field label="Gender" privacy={privacy.show_gender as any} onPrivacyToggle={() => togglePrivacy('show_gender')}>
          <select value={gender} onChange={e => setGender(e.target.value)} className="input-base w-full text-sm">
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Pronouns">
          <Input value={pronouns} onChange={setPronouns} placeholder="e.g. he/him, she/her, they/them" maxLength={30} />
        </Field>
        <Field label="Nationality" privacy={privacy.show_nationality as any} onPrivacyToggle={() => togglePrivacy('show_nationality')}>
          <Input value={nationality} onChange={setNationality} placeholder="e.g. Indian" maxLength={50} />
        </Field>
        <Field label="Relationship Status">
          <select value={relationship} onChange={e => setRelationship(e.target.value)} className="input-base w-full text-sm">
            <option value="">Select status</option>
            {RELATIONSHIP_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Languages">
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(lang => (
              <button key={lang} onClick={() => toggleLanguage(lang)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  languages.includes(lang)
                    ? "bg-primary-muted border-primary text-primary"
                    : "border-border text-text-muted hover:border-border-active")}>
                {languages.includes(lang) && <Check size={10} className="inline mr-1" />}
                {lang}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* ── Account Privacy ── */}
      <Section title="Privacy" emoji="🔒">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Private Account</p>
            <p className="text-xs text-text-muted mt-0.5">Only followers can see your posts</p>
          </div>
          <button onClick={() => setIsPrivate(p => !p)}
            className={cn("w-12 h-6 rounded-full p-0.5 transition-colors duration-200 flex-shrink-0",
              isPrivate ? "bg-primary" : "bg-bg-card2")}>
            <div className={cn("w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
              isPrivate ? "translate-x-6" : "translate-x-0")} />
          </button>
        </div>
      </Section>

      {/* ── Notifications ── */}
      <Section title="Notifications" emoji="🔔">
        {Object.entries(notifPrefs).map(([key, val]) => {
          const labels: Record<string, string> = {
            new_follower: 'New follower', follow_request: 'Follow requests',
            new_reaction: 'Reactions on posts', new_comment: 'Comments',
            new_message: 'Direct messages', mystery_revealed: 'Mystery reveals',
            challenge_reminder: 'Challenge reminders', new_anonymous_question: 'Anonymous questions',
            badge_awarded: 'Badges earned', level_up: 'Level up', marketing: 'Updates & tips'
          }
          return (
            <div key={key} className="flex items-center justify-between py-0.5">
              <span className="text-sm">{labels[key] || key}</span>
              <button onClick={() => setNotifPrefs(n => ({ ...n, [key]: !val }))}
                className={cn("w-10 h-5 rounded-full p-0.5 transition-colors duration-200",
                  val ? "bg-primary" : "bg-bg-card2")}>
                <div className={cn("w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
                  val ? "translate-x-5" : "translate-x-0")} />
              </button>
            </div>
          )
        })}
        <button onClick={saveNotifPrefs}
          className="w-full py-2 rounded-xl border border-border text-sm font-semibold hover:bg-bg-card2 transition-colors">
          Save Notification Preferences
        </button>
      </Section>

      {/* ── Appearance ── */}
      <Section title="Appearance" emoji="🎨">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isDark ? <Moon size={18} className="text-primary" /> : <Sun size={18} className="text-accent-yellow" />}
            <div>
              <p className="text-sm font-semibold">{isDark ? 'Dark Mode' : 'Light Mode'}</p>
              <p className="text-xs text-text-muted">Tap to toggle theme</p>
            </div>
          </div>
          <button onClick={toggleTheme}
            className={cn("w-12 h-6 rounded-full p-0.5 transition-colors duration-200",
              isDark ? "bg-primary" : "bg-bg-card2")}>
            <div className={cn("w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
              isDark ? "translate-x-6" : "translate-x-0")} />
          </button>
        </div>
      </Section>

      {/* ── Account ── */}
      <Section title="Account" emoji="⚙️">
        <Link href="/settings/blocked"
          className="flex items-center justify-between py-2 hover:opacity-70 transition-opacity">
          <div className="flex items-center gap-3">
            <UserX size={16} className="text-text-muted" />
            <span className="text-sm">Blocked accounts</span>
          </div>
          <ChevronRight size={16} className="text-text-muted" />
        </Link>
        <button onClick={handleSignOut}
          className="flex items-center gap-3 py-2 w-full text-left hover:opacity-70 transition-opacity">
          <ArrowLeft size={16} className="text-accent-red" />
          <span className="text-sm text-accent-red font-semibold">Sign out</span>
        </button>
        <button onClick={handleDeleteAccount}
          className="flex items-center gap-3 py-2 w-full text-left hover:opacity-70 transition-opacity">
          <Trash2 size={16} className="text-accent-red/60" />
          <span className="text-sm text-accent-red/60">Delete account</span>
        </button>
      </Section>

      {/* ── Save button ── */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-base flex items-center justify-center gap-2 sticky bottom-4 shadow-glow disabled:opacity-60 active:scale-[0.98] transition-transform">
        {saving ? <><Loader2 size={18} className="animate-spin" /> Saving…</> : <><Save size={18} /> Save Profile</>}
      </button>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="lg:hidden">
        <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3">
          <Link href="/profile" className="text-text-muted hover:text-text">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-bold text-base flex-1">Edit Profile</h1>
        </div>
        <SettingsContent />
        <BottomNav />
      </div>
      <div className="hidden lg:flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto border-x border-border">
          <div className="sticky top-0 z-40 bg-bg/90 backdrop-blur border-b border-border px-6 py-3 flex items-center gap-3">
            <Link href="/profile" className="text-text-muted hover:text-text">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="font-bold">Edit Profile</h1>
          </div>
          <SettingsContent />
        </main>
      </div>
    </div>
  )
}

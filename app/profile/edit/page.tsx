'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, Camera, Plus, Trash2, Loader2, Eye, Users, Lock, Link2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api, swrFetcher, getErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

type Visibility = 'public' | 'followers' | 'private'
const VIS_ORDER: Visibility[] = ['public', 'followers', 'private']
const VIS_CFG = {
  public:    { icon: '👁️', label: 'Public',    class: 'text-accent-green border-accent-green/40' },
  followers: { icon: '👥', label: 'Followers', class: 'text-primary border-primary/40' },
  private:   { icon: '🔒', label: 'Private',   class: 'text-text-muted border-border' } }

function VisCycle({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  const next = () => onChange(VIS_ORDER[(VIS_ORDER.indexOf(value) + 1) % 3])
  const cfg = VIS_CFG[value]
  return (
    <button onClick={next}
      className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 transition-all', cfg.class)}>
      {cfg.icon} {cfg.label}
    </button>
  )
}

const RELATIONSHIP_OPTIONS = [
  { v: '', l: 'Not set' }, { v: 'single', l: 'Single' },
  { v: 'in_relationship', l: 'In a relationship' }, { v: 'engaged', l: 'Engaged' },
  { v: 'married', l: 'Married' }, { v: 'its_complicated', l: "It's complicated" },
  { v: 'in_open_relationship', l: 'In an open relationship' },
  { v: 'widowed', l: 'Widowed' }, { v: 'separated', l: 'Separated' },
  { v: 'divorced', l: 'Divorced' },
]

const INTEREST_SECTIONS = [
  { key: 'music',    label: 'Music',    emoji: '🎵', placeholder: 'e.g. Arijit Singh, Lo-fi' },
  { key: 'tv_shows', label: 'TV Shows', emoji: '📺', placeholder: 'e.g. Scam 1992, Breaking Bad' },
  { key: 'movies',   label: 'Movies',  emoji: '🎬', placeholder: 'e.g. Dangal, Inception' },
  { key: 'games',    label: 'Games',   emoji: '🎮', placeholder: 'e.g. BGMI, Chess' },
  { key: 'sports',   label: 'Sports',  emoji: '🏏', placeholder: 'e.g. Cricket, KKR, Virat Kohli' },
  { key: 'places',   label: 'Travel',  emoji: '✈️', placeholder: 'e.g. Darjeeling, Bali, Paris' },
  { key: 'hobbies',  label: 'Hobbies', emoji: '🎨', placeholder: 'e.g. Photography, Cooking' },
  { key: 'books',    label: 'Books',   emoji: '📖', placeholder: 'e.g. Feluda, Harry Potter' },
] as const

export default function EditProfilePage() {
  const router = useRouter()
  const { profile, refreshProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const coverRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)

  const { data: extData } = useSWR(
    profile?.id ? `/api/users/extended-profile?user_id=${profile.id}` : null, swrFetcher)
  const ext = (extData as any)?.data

  // Personal
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [pinned, setPinned] = useState('')
  const [currentCity, setCurrentCity] = useState('')
  const [hometown, setHometown] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [relationship, setRelationship] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [langInput, setLangInput] = useState('')
  // Work
  const [work, setWork] = useState<any[]>([])
  // Education
  const [education, setEducation] = useState<any[]>([])
  // Interests
  const [interests, setInterests] = useState<Record<string, any>>({
    music: [], tv_shows: [], movies: [], games: [],
    sports: [], places: [], hobbies: [], books: [],
    visibility: 'public' })
  // Links
  const [links, setLinks] = useState<any[]>([])
  // Social
  const [instagram, setInstagram] = useState('')
  const [twitter, setTwitter] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [youtube, setYoutube] = useState('')
  // Privacy
  const [priv, setPriv] = useState<Record<string, Visibility>>({
    show_current_city: 'public', show_hometown: 'public',
    show_dob: 'private', show_gender: 'private',
    show_relationship: 'followers', show_work: 'public',
    show_education: 'public', show_interests: 'public',
    show_links: 'public', show_social: 'followers', show_phone: 'private' })

  useEffect(() => {
    if (!ext) return
    setDisplayName(ext.display_name || ext.full_name || '')
    setBio(ext.bio || '')
    setPinned(ext.pinned_info || '')
    setCurrentCity(ext.current_city || ext.city || '')
    setHometown(ext.hometown || '')
    setDob(ext.dob?.slice(0, 10) || '')
    setGender(ext.gender || '')
    setPronouns(ext.pronouns || '')
    setRelationship(ext.relationship_status || '')
    setLanguages(ext.languages || [])
    setInstagram(ext.social_instagram || '')
    setTwitter(ext.social_twitter || '')
    setLinkedin(ext.social_linkedin || '')
    setYoutube(ext.social_youtube || '')
    if (ext.work?.length) setWork(ext.work)
    if (ext.education?.length) setEducation(ext.education)
    if (ext.interests) setInterests(i => ({ ...i, ...ext.interests }))
    if (ext.links?.length) setLinks(ext.links)
    if (ext.privacy_settings) setPriv(p => ({ ...p, ...ext.privacy_settings }))
  }, [ext])

  async function uploadFile(file: File, field: 'avatar_url' | 'cover_url') {
    try {
      const uploadType = field === 'avatar_url' ? 'avatars' : 'covers'
      let fileToUpload = file
      try {
        const { compressImage } = await import('@/lib/media')
        const comp = await compressImage(file, uploadType === 'avatars' ? 'avatar' : 'cover')
        fileToUpload = comp.file
      } catch { /* use original */ }
      const { uploadToImageKit } = await import('@/lib/upload')
      const result = await uploadToImageKit(fileToUpload, uploadType as any)
      if (!result?.url) throw new Error('Upload failed')
      await api.patch('/api/users/profile', { [field]: result.url }, { requireAuth: true })
      await refreshProfile()
      toast.success(field === 'avatar_url' ? 'Profile photo updated!' : 'Cover photo updated!')
    } catch { toast.error('Upload failed') }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await api.patch('/api/users/extended-profile', {
        display_name: displayName, bio, pinned_info: pinned,
        current_city: currentCity, hometown, dob: dob || null,
        gender, pronouns, relationship_status: relationship || null,
        languages, social_instagram: instagram, social_twitter: twitter,
        social_linkedin: linkedin, social_youtube: youtube,
        work, education, interests, links,
        privacy_settings: priv }, { requireAuth: true })
      await refreshProfile()
      toast.success('Profile saved! ✓')
      router.back()
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  if (!profile) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="min-h-screen bg-bg pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()}><ArrowLeft size={22} className="text-text-muted" /></button>
        <h1 className="font-bold flex-1">Edit Profile</h1>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
          {saving && <Loader2 size={13} className="animate-spin" />}{saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Cover photo */}
      <div className="relative h-36 bg-gradient-to-br from-primary/30 to-accent-purple/30 overflow-hidden cursor-pointer"
        onClick={() => coverRef.current?.click()}>
        {ext?.cover_url && <img src={ext.cover_url} className="w-full h-full object-cover" alt="Cover" />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors">
          <div className="flex items-center gap-2 bg-black/50 text-white px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur">
            <Camera size={14} /> Edit Cover Photo
          </div>
        </div>
        <input ref={coverRef} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], 'cover_url')} />
      </div>

      {/* Avatar */}
      <div className="px-4 pb-3 -mt-14 flex items-end gap-4">
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-bg bg-gradient-primary overflow-hidden shadow-2xl">
            {profile.avatar_url
              ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
              : <div className="w-full h-full flex items-center justify-center text-white text-3xl font-black">
                  {(profile.display_name || profile.username || '?')[0].toUpperCase()}
                </div>}
          </div>
          <button onClick={() => avatarRef.current?.click()}
            className="absolute bottom-0 right-0 w-8 h-8 bg-bg-card2 border-2 border-bg rounded-full flex items-center justify-center shadow">
            <Camera size={14} className="text-text" />
          </button>
          <input ref={avatarRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], 'avatar_url')} />
        </div>
        <div className="pb-1">
          <p className="font-black text-lg leading-tight">{profile.display_name || profile.full_name || profile.username}</p>
          <p className="text-xs text-text-muted">@{profile.username}</p>
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* INTRO */}
        <Sec title="Intro" emoji="👋">
          <FLD label="Display Name"><input value={displayName} onChange={e => setDisplayName(e.target.value)} className="input-base text-sm" maxLength={50} /></FLD>
          <FLD label="Bio">
            <textarea value={bio} onChange={e => setBio(e.target.value)} className="input-base text-sm resize-none" rows={2} maxLength={160} />
            <p className="text-xs text-right text-text-muted">{bio.length}/160</p>
          </FLD>
          <FLD label="Pinned detail"><input value={pinned} onChange={e => setPinned(e.target.value)} className="input-base text-sm" maxLength={100} placeholder="e.g. Engineer at Google · Kolkata" /></FLD>
        </Sec>

        {/* PERSONAL */}
        <Sec title="Personal Details" emoji="📋">
          <VFLD label="Current City" vis={priv.show_current_city} onVis={v => setPriv(p => ({...p, show_current_city: v}))}>
            <input value={currentCity} onChange={e => setCurrentCity(e.target.value)} className="input-base text-sm" placeholder="Where do you live?" />
          </VFLD>
          <VFLD label="Hometown" vis={priv.show_hometown} onVis={v => setPriv(p => ({...p, show_hometown: v}))}>
            <input value={hometown} onChange={e => setHometown(e.target.value)} className="input-base text-sm" placeholder="Where are you from?" />
          </VFLD>
          <VFLD label="Date of Birth" vis={priv.show_dob} onVis={v => setPriv(p => ({...p, show_dob: v}))}>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)} className="input-base text-sm" />
          </VFLD>
          <VFLD label="Gender" vis={priv.show_gender} onVis={v => setPriv(p => ({...p, show_gender: v}))}>
            <select value={gender} onChange={e => setGender(e.target.value)} className="input-base text-sm">
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non_binary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </VFLD>
          <FLD label="Pronouns"><input value={pronouns} onChange={e => setPronouns(e.target.value)} className="input-base text-sm" placeholder="he/him · she/her · they/them" maxLength={30} /></FLD>
          <VFLD label="Relationship Status" vis={priv.show_relationship} onVis={v => setPriv(p => ({...p, show_relationship: v}))}>
            <select value={relationship} onChange={e => setRelationship(e.target.value)} className="input-base text-sm">
              {RELATIONSHIP_OPTIONS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </VFLD>
          <FLD label="Languages">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {languages.map(l => <TagChip key={l} label={l} onRemove={() => setLanguages(prev => prev.filter(x => x !== l))} />)}
            </div>
            <input value={langInput} onChange={e => setLangInput(e.target.value)} className="input-base text-sm"
              placeholder="Add language, press Enter" maxLength={30}
              onKeyDown={e => { if (e.key === 'Enter' && langInput.trim()) { setLanguages(p => [...p, langInput.trim()].slice(0,10)); setLangInput(''); e.preventDefault() }}} />
          </FLD>
        </Sec>

        {/* WORK */}
        <Sec title="Work" emoji="💼" action={<button onClick={() => setWork(p => [...p, {company:'',position:'',city:'',description:'',start_date:'',is_current:false,visibility:'public'}])} className="text-xs text-primary flex items-center gap-1"><Plus size={12} /> Add</button>}>
          {work.length === 0 && <button onClick={() => setWork(p => [...p, {company:'',position:'',city:'',description:'',start_date:'',is_current:false,visibility:'public'}])} className="text-sm text-text-muted py-2 hover:text-text flex items-center gap-2">💼 Add work experience</button>}
          {work.map((w, i) => (
            <div key={i} className="p-3 bg-bg-card2 rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-text-muted">Position {i+1}</span>
                <div className="flex items-center gap-2">
                  <VisCycle value={w.visibility||'public'} onChange={v => setWork(p => p.map((x,j) => j===i ? {...x,visibility:v} : x))} />
                  <button onClick={() => setWork(p => p.filter((_,j) => j!==i))} className="text-accent-red"><Trash2 size={14} /></button>
                </div>
              </div>
              <input value={w.company} onChange={e => setWork(p => p.map((x,j) => j===i?{...x,company:e.target.value}:x))} placeholder="Company" className="input-base text-sm" />
              <input value={w.position} onChange={e => setWork(p => p.map((x,j) => j===i?{...x,position:e.target.value}:x))} placeholder="Job title" className="input-base text-sm" />
              <input value={w.city||''} onChange={e => setWork(p => p.map((x,j) => j===i?{...x,city:e.target.value}:x))} placeholder="City (optional)" className="input-base text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-xs text-text-muted mb-1">Start</p><input type="month" value={w.start_date?.slice(0,7)||''} onChange={e => setWork(p => p.map((x,j) => j===i?{...x,start_date:e.target.value}:x))} className="input-base text-sm" /></div>
                {!w.is_current && <div><p className="text-xs text-text-muted mb-1">End</p><input type="month" value={w.end_date?.slice(0,7)||''} onChange={e => setWork(p => p.map((x,j) => j===i?{...x,end_date:e.target.value}:x))} className="input-base text-sm" /></div>}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={w.is_current} onChange={e => setWork(p => p.map((x,j) => j===i?{...x,is_current:e.target.checked}:x))} className="w-4 h-4 accent-primary" /> Currently working here</label>
            </div>
          ))}
        </Sec>

        {/* EDUCATION */}
        <Sec title="Education" emoji="🎓" action={<button onClick={() => setEducation(p => [...p, {school:'',degree:'',field:'',start_year:'',is_current:false,visibility:'public'}])} className="text-xs text-primary flex items-center gap-1"><Plus size={12} /> Add</button>}>
          {education.length === 0 && <button onClick={() => setEducation(p => [...p, {school:'',degree:'',field:'',start_year:'',is_current:false,visibility:'public'}])} className="text-sm text-text-muted py-2 hover:text-text flex items-center gap-2">🎓 Add education</button>}
          {education.map((e, i) => (
            <div key={i} className="p-3 bg-bg-card2 rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-text-muted">School {i+1}</span>
                <div className="flex items-center gap-2">
                  <VisCycle value={e.visibility||'public'} onChange={v => setEducation(p => p.map((x,j) => j===i?{...x,visibility:v}:x))} />
                  <button onClick={() => setEducation(p => p.filter((_,j) => j!==i))} className="text-accent-red"><Trash2 size={14} /></button>
                </div>
              </div>
              <input value={e.school} onChange={ev => setEducation(p => p.map((x,j) => j===i?{...x,school:ev.target.value}:x))} placeholder="School / College / University" className="input-base text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <select value={e.degree||''} onChange={ev => setEducation(p => p.map((x,j) => j===i?{...x,degree:ev.target.value}:x))} className="input-base text-sm">
                  <option value="">Degree</option>
                  {["High School","Diploma","Bachelor's","Master's","PhD","MBA","Other"].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input value={e.field||''} onChange={ev => setEducation(p => p.map((x,j) => j===i?{...x,field:ev.target.value}:x))} placeholder="Field of study" className="input-base text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={e.start_year||''} onChange={ev => setEducation(p => p.map((x,j) => j===i?{...x,start_year:ev.target.value}:x))} placeholder="Start year" className="input-base text-sm" />
                {!e.is_current && <input type="number" value={e.end_year||''} onChange={ev => setEducation(p => p.map((x,j) => j===i?{...x,end_year:ev.target.value}:x))} placeholder="End year" className="input-base text-sm" />}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={e.is_current} onChange={ev => setEducation(p => p.map((x,j) => j===i?{...x,is_current:ev.target.checked}:x))} className="w-4 h-4 accent-primary" /> Currently studying</label>
            </div>
          ))}
        </Sec>

        {/* INTERESTS */}
        <Sec title="Interests & Hobbies" emoji="✨" action={<VisCycle value={interests.visibility||'public'} onChange={v => setInterests(p => ({...p,visibility:v}))} />}>
          {INTEREST_SECTIONS.map(({ key, label, emoji, placeholder }) => (
            <InterestInput
              key={key}
              sectionKey={key}
              label={label}
              emoji={emoji}
              placeholder={placeholder}
              values={(interests[key] as string[]) || []}
              onAdd={(v) => setInterests(p => ({...p, [key]: [...(p[key] as string[]), v].slice(0, 20)}))}
              onRemove={(v) => setInterests(p => ({...p, [key]: (p[key] as string[]).filter(x => x !== v)}))}
            />
          ))}
        </Sec>

        {/* LINKS */}
        <Sec title="Links" emoji="🔗" action={<button onClick={() => setLinks(p => [...p,{label:'',url:'',icon:'globe'}])} className="text-xs text-primary flex items-center gap-1"><Plus size={12}/> Add</button>}>
          {links.length===0 && <button onClick={() => setLinks(p => [...p,{label:'',url:'',icon:'globe'}])} className="text-sm text-text-muted py-2 flex items-center gap-2">🔗 Add website or portfolio</button>}
          {links.map((l,i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={l.label} onChange={e => setLinks(p => p.map((x,j) => j===i?{...x,label:e.target.value}:x))} placeholder="Label" className="input-base text-sm w-24" />
              <input value={l.url} onChange={e => setLinks(p => p.map((x,j) => j===i?{...x,url:e.target.value}:x))} placeholder="https://..." className="input-base text-sm flex-1" />
              <button onClick={() => setLinks(p => p.filter((_,j) => j!==i))} className="text-accent-red"><Trash2 size={14}/></button>
            </div>
          ))}
        </Sec>

        {/* SOCIAL MEDIA */}
        <Sec title="Social Media" emoji="📱" action={<VisCycle value={priv.show_social} onVis={v => setPriv(p => ({...p,show_social:v}))} onChange={v => setPriv(p => ({...p,show_social:v}))} />}>
          {[
            {label:'Instagram', emoji:'📷', val:instagram, set:setInstagram, ph:'@username'},
            {label:'Twitter/X', emoji:'🐦', val:twitter, set:setTwitter, ph:'@username'},
            {label:'LinkedIn',  emoji:'💼', val:linkedin, set:setLinkedin, ph:'linkedin.com/in/...'},
            {label:'YouTube',   emoji:'▶️', val:youtube, set:setYoutube, ph:'@channelname'},
          ].map(({label,emoji,val,set,ph}) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xl flex-shrink-0">{emoji}</span>
              <div className="flex-1">
                <p className="text-xs text-text-muted mb-0.5">{label}</p>
                <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className="input-base text-sm" />
              </div>
            </div>
          ))}
        </Sec>

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 font-bold">
          {saving && <Loader2 size={15} className="animate-spin" />}{saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>
    </div>
  )
}

// Separate component so useState is at top level (React Hooks rules)
function InterestInput({ sectionKey, label, emoji, placeholder, values, onAdd, onRemove }: {
  sectionKey: string; label: string; emoji: string; placeholder: string
  values: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void
}) {
  const [inp, setInp] = useState('')
  return (
    <div>
      <label className="text-xs font-semibold text-text-muted mb-1.5 flex items-center gap-1.5">{emoji} {label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => <TagChip key={v} label={v} onRemove={() => onRemove(v)} />)}
      </div>
      <input value={inp} onChange={e => setInp(e.target.value)}
        className="input-base text-sm" placeholder={placeholder} maxLength={50}
        onKeyDown={e => { if (e.key === 'Enter' && inp.trim()) { onAdd(inp.trim()); setInp(''); e.preventDefault() }}} />
    </div>
  )
}

function Sec({ title, emoji, children, action }: { title:string; emoji:string; children:React.ReactNode; action?:React.ReactNode }) {
  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-bold text-sm">{emoji} {title}</h3>{action}</div>
      {children}
    </div>
  )
}
function FLD({ label, children }: { label:string; children:React.ReactNode }) {
  return <div><p className="text-xs font-semibold text-text-muted mb-1">{label}</p>{children}</div>
}
function VFLD({ label, vis, onVis, children }: { label:string; vis:Visibility; onVis:(v:Visibility)=>void; children:React.ReactNode }) {
  return <div><div className="flex items-center justify-between mb-1"><p className="text-xs font-semibold text-text-muted">{label}</p><VisCycle value={vis} onChange={onVis} /></div>{children}</div>
}
function TagChip({ label, onRemove }: { label:string; onRemove:()=>void }) {
  return <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary-muted rounded-full border border-primary/30 text-primary">{label}<button onClick={onRemove}>×</button></span>
}

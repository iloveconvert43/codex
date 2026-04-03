export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/users/extended-profile?user_id=<id>  — Fetch full profile
 * PATCH /api/users/extended-profile               — Update own profile
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID, sanitizeInput } from '@/lib/security'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)
    const targetId = searchParams.get('user_id')
    if (!targetId || !isValidUUID(targetId)) {
      return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 })
    }

    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let viewerId: string | null = null
    if (sessionUser) {
      const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
      viewerId = me?.id ?? null
    }

    const isOwnProfile = viewerId === targetId
    const { data: followRow } = viewerId && !isOwnProfile
      ? await supabase.from('follows').select('follower_id').eq('follower_id', viewerId).eq('following_id', targetId).maybeSingle()
      : { data: null as any }
    const isFollower = !!followRow

    // Fetch user base profile
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, username, display_name, full_name, bio, avatar_url, cover_url,
        city, current_city, hometown, gender, dob, nationality,
        relationship_status, languages, website_url, pronouns,
        social_instagram, social_twitter, social_linkedin, social_youtube,
        pinned_info, family_members, is_verified, is_private, theme_pref,
        created_at, privacy_settings
      `)
      .eq('id', targetId)
      .single()

    if (error || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const privacy: Record<string, string> = (user as any).privacy_settings || {}
    const canView = (field: string, fallback: 'public' | 'followers' | 'private' = 'public') => {
      const vis = (privacy[field] || fallback) as 'public' | 'followers' | 'private'
      if (isOwnProfile) return true
      if (vis === 'public') return true
      if (vis === 'followers') return isFollower
      return false
    }

    const visibleWorkScopes = isOwnProfile ? ['public', 'followers', 'private'] : isFollower ? ['public', 'followers'] : ['public']
    const visibleEducationScopes = visibleWorkScopes

    // Fetch work, education, interests, links in parallel
    const [workRes, eduRes, interestsRes, linksRes] = await Promise.all([
      supabase.from('profile_work')
        .select('*').eq('user_id', targetId)
        .in('visibility', visibleWorkScopes)
        .order('is_current', { ascending: false })
        .order('display_order'),
      supabase.from('profile_education')
        .select('*').eq('user_id', targetId)
        .in('visibility', visibleEducationScopes)
        .order('is_current', { ascending: false })
        .order('display_order'),
      supabase.from('profile_interests')
        .select('*').eq('user_id', targetId).single(),
      supabase.from('profile_links')
        .select('*').eq('user_id', targetId).order('display_order'),
    ])

    // Post count
    const { count: postCount } = await supabase
      .from('posts').select('id', { count: 'exact', head: true })
      .eq('user_id', targetId).eq('is_deleted', false)

    // Follower / following counts
    const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId),
    ])

    const currentCityVisible = canView('show_current_city', 'public')
    const hometownVisible = canView('show_hometown', 'public')
    const dobVisible = canView('show_dob', 'private')
    const genderVisible = canView('show_gender', 'private')
    const relationshipVisible = canView('show_relationship', 'followers')
    const nationalityVisible = canView('show_nationality', 'public')
    const socialVisible = canView('show_social', 'followers')
    const workVisible = canView('show_work', 'public')
    const educationVisible = canView('show_education', 'public')
    const interestsVisible = canView('show_interests', 'public')
    const linksVisible = canView('show_links', 'public')

    const filteredUser = {
      ...user,
      city: currentCityVisible ? (user.current_city || user.city || null) : null,
      current_city: currentCityVisible ? (user.current_city || user.city || null) : null,
      hometown: hometownVisible ? user.hometown : null,
      dob: dobVisible ? user.dob : null,
      gender: genderVisible ? user.gender : null,
      nationality: nationalityVisible ? user.nationality : null,
      relationship_status: relationshipVisible ? user.relationship_status : null,
      website_url: linksVisible ? user.website_url : null,
      social_instagram: socialVisible ? user.social_instagram : null,
      social_twitter: socialVisible ? user.social_twitter : null,
      social_linkedin: socialVisible ? user.social_linkedin : null,
      social_youtube: socialVisible ? user.social_youtube : null,
    }

    const res = NextResponse.json({
      data: {
        ...filteredUser,
        work:         workVisible ? (workRes.data || []) : [],
        education:    educationVisible ? (eduRes.data || []) : [],
        interests:    interestsVisible ? (interestsRes.data || null) : null,
        links:        linksVisible ? (linksRes.data || []) : [],
        post_count:   postCount || 0,
        follower_count:  followerCount || 0,
        following_count: followingCount || 0 }
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[extended-profile GET]', err.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const {
      // Basic
      display_name, bio, city, current_city, hometown, gender, dob,
      nationality, relationship_status, languages, website_url,
      pronouns, social_instagram, social_twitter, social_linkedin, social_youtube,
      pinned_info, privacy_settings,
      // Arrays
      work, education, interests, links } = body

    // Update base user record
    const userUpdate: Record<string, any> = {}
    if (display_name !== undefined) userUpdate.display_name = sanitizeInput(display_name).slice(0, 50)
    if (bio !== undefined) userUpdate.bio = sanitizeInput(bio).slice(0, 160)
    if (city !== undefined) userUpdate.city = sanitizeInput(city || '').slice(0, 100)
    if (current_city !== undefined) userUpdate.current_city = sanitizeInput(current_city || '').slice(0, 100)
    if (hometown !== undefined) userUpdate.hometown = sanitizeInput(hometown || '').slice(0, 100)
    if (gender !== undefined) userUpdate.gender = gender
    if (dob !== undefined) userUpdate.dob = dob || null
    if (nationality !== undefined) userUpdate.nationality = sanitizeInput(nationality || '').slice(0, 50)
    if (relationship_status !== undefined) userUpdate.relationship_status = relationship_status
    if (languages !== undefined) userUpdate.languages = Array.isArray(languages) ? languages.slice(0, 10) : []
    if (website_url !== undefined) userUpdate.website_url = website_url ? website_url.slice(0, 200) : null
    if (pronouns !== undefined) userUpdate.pronouns = pronouns ? pronouns.slice(0, 30) : null
    if (social_instagram !== undefined) userUpdate.social_instagram = social_instagram?.slice(0, 100)
    if (social_twitter !== undefined) userUpdate.social_twitter = social_twitter?.slice(0, 100)
    if (social_linkedin !== undefined) userUpdate.social_linkedin = social_linkedin?.slice(0, 200)
    if (social_youtube !== undefined) userUpdate.social_youtube = social_youtube?.slice(0, 200)
    if (pinned_info !== undefined) userUpdate.pinned_info = sanitizeInput(pinned_info || '').slice(0, 300)
    if (privacy_settings !== undefined) userUpdate.privacy_settings = privacy_settings

    if (Object.keys(userUpdate).length > 0) {
      await supabase.from('users').update(userUpdate).eq('id', me.id)
    }

    // Update work entries (replace all)
    if (Array.isArray(work)) {
      await supabase.from('profile_work').delete().eq('user_id', me.id)
      if (work.length > 0) {
        await supabase.from('profile_work').insert(
          work.slice(0, 10).map((w: any, i: number) => ({
            user_id: me.id,
            company: sanitizeInput(w.company || '').slice(0, 100),
            position: sanitizeInput(w.position || '').slice(0, 100),
            city: sanitizeInput(w.city || '').slice(0, 100),
            description: sanitizeInput(w.description || '').slice(0, 500),
            start_date: w.start_date || null,
            end_date: w.is_current ? null : (w.end_date || null),
            is_current: !!w.is_current,
            visibility: w.visibility || 'public',
            display_order: i }))
        )
      }
    }

    // Update education
    if (Array.isArray(education)) {
      await supabase.from('profile_education').delete().eq('user_id', me.id)
      if (education.length > 0) {
        await supabase.from('profile_education').insert(
          education.slice(0, 10).map((e: any, i: number) => ({
            user_id: me.id,
            school: sanitizeInput(e.school || '').slice(0, 100),
            degree: sanitizeInput(e.degree || '').slice(0, 100),
            field: sanitizeInput(e.field || '').slice(0, 100),
            city: sanitizeInput(e.city || '').slice(0, 100),
            start_year: e.start_year ? parseInt(e.start_year) : null,
            end_year: e.is_current ? null : (e.end_year ? parseInt(e.end_year) : null),
            is_current: !!e.is_current,
            visibility: e.visibility || 'public',
            display_order: i }))
        )
      }
    }

    // Update interests (upsert)
    if (interests && typeof interests === 'object') {
      await supabase.from('profile_interests').upsert({
        user_id:   me.id,
        music:     Array.isArray(interests.music)    ? interests.music.slice(0, 20)    : [],
        tv_shows:  Array.isArray(interests.tv_shows) ? interests.tv_shows.slice(0, 20) : [],
        movies:    Array.isArray(interests.movies)   ? interests.movies.slice(0, 20)   : [],
        games:     Array.isArray(interests.games)    ? interests.games.slice(0, 20)    : [],
        sports:    Array.isArray(interests.sports)   ? interests.sports.slice(0, 20)   : [],
        places:    Array.isArray(interests.places)   ? interests.places.slice(0, 20)   : [],
        hobbies:   Array.isArray(interests.hobbies)  ? interests.hobbies.slice(0, 20)  : [],
        books:     Array.isArray(interests.books)    ? interests.books.slice(0, 20)    : [],
        visibility: interests.visibility || 'public',
        updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    }

    // Update links (replace all)
    if (Array.isArray(links)) {
      await supabase.from('profile_links').delete().eq('user_id', me.id)
      if (links.length > 0) {
        await supabase.from('profile_links').insert(
          links.slice(0, 10).map((l: any, i: number) => ({
            user_id: me.id,
            label: sanitizeInput(l.label || '').slice(0, 50),
            url: l.url?.slice(0, 200),
            icon: l.icon || 'globe',
            display_order: i }))
        )
      }
    }

    const res = NextResponse.json({ ok: true })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[extended-profile PATCH]', err.message)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

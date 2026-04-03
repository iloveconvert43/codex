-- ============================================================
-- tryHushly SEED DATA — Test/Development Data
-- Run this in Supabase SQL Editor AFTER running schema.sql
-- ============================================================
-- ⚠️  DO NOT run in production with real users
-- This creates dummy accounts for feature testing only
-- ============================================================

-- ── STEP 1: Create test auth users ────────────────────────
-- Note: In Supabase, create these from Authentication → Users
-- OR use the API. These UUIDs must match real auth.users entries.
-- Below we create the profiles assuming auth users exist.

-- For testing: create 5 test users manually in Supabase Auth dashboard
-- Email: test1@tryhushly.com ... test5@tryhushly.com
-- Password: Test@1234

-- ── STEP 2: Insert test user profiles ─────────────────────
-- Replace these UUIDs with the actual auth.users UUIDs from your Supabase dashboard

DO $$
DECLARE
  -- Replace these with actual auth user IDs from Supabase Auth dashboard
  uid1 UUID := '00000000-0000-0000-0000-000000000001';
  uid2 UUID := '00000000-0000-0000-0000-000000000002';
  uid3 UUID := '00000000-0000-0000-0000-000000000003';
  uid4 UUID := '00000000-0000-0000-0000-000000000004';
  uid5 UUID := '00000000-0000-0000-0000-000000000005';

  -- Profile IDs
  pid1 UUID; pid2 UUID; pid3 UUID; pid4 UUID; pid5 UUID;
  
  -- Room IDs
  r_midnight UUID; r_career UUID; r_relationship UUID;
  
  -- Post IDs
  post1 UUID; post2 UUID; post3 UUID; post4 UUID; post5 UUID;
  post6 UUID; post7 UUID; post8 UUID;

BEGIN

-- ── Test User Profiles ─────────────────────────────────────
INSERT INTO users (auth_id, full_name, username, display_name, bio, email, city, country, is_anonymous, is_verified, email_verified, latitude, longitude)
VALUES
  (uid1, 'Priya Sharma', 'priya_s', 'Priya', 'Night owl 🦉 | Midnight thoughts enthusiast', 'test1@tryhushly.com', 'Mumbai', 'India', false, true, true, 19.0760, 72.8777),
  (uid2, 'Rahul Dev', 'rahul_d', 'Rahul', 'Software dev by day, philosopher by night 💻', 'test2@tryhushly.com', 'Bangalore', 'India', false, false, true, 12.9716, 77.5946),
  (uid3, 'Aisha Khan', 'aisha_k', 'Aisha', 'Foodie | Local secrets hunter 🍜', 'test3@tryhushly.com', 'Delhi', 'India', false, false, true, 28.6139, 77.2090),
  (uid4, 'Vikram Nair', 'vikram_n', 'Vikram', 'Startup founder | Sharing the real journey', 'test4@tryhushly.com', 'Mumbai', 'India', false, false, true, 19.0600, 72.8400),
  (uid5, 'Sneha Patel', 'sneha_p', 'Sneha', '3am thoughts and chai ☕', 'test5@tryhushly.com', 'Ahmedabad', 'India', false, false, true, 23.0225, 72.5714)
ON CONFLICT (auth_id) DO NOTHING;

-- Get profile IDs
SELECT id INTO pid1 FROM users WHERE auth_id = uid1;
SELECT id INTO pid2 FROM users WHERE auth_id = uid2;
SELECT id INTO pid3 FROM users WHERE auth_id = uid3;
SELECT id INTO pid4 FROM users WHERE auth_id = uid4;
SELECT id INTO pid5 FROM users WHERE auth_id = uid5;

IF pid1 IS NULL THEN
  RAISE NOTICE 'Test users not created - auth users may not exist. Create auth users first.';
  RETURN;
END IF;

-- ── Initialize points for test users ──────────────────────
INSERT INTO user_points (user_id, total_points, weekly_points, level)
VALUES
  (pid1, 850, 120, 'mystery_maker'),
  (pid2, 340, 80, 'story_seeker'),
  (pid3, 180, 45, 'story_seeker'),
  (pid4, 620, 90, 'mystery_maker'),
  (pid5, 95, 30, 'curious_newcomer')
ON CONFLICT (user_id) DO NOTHING;

-- ── Badges ────────────────────────────────────────────────
INSERT INTO user_badges (user_id, badge) VALUES
  (pid1, 'early_adopter'), (pid1, 'streak_7'), (pid1, 'mystery_master'),
  (pid2, 'early_adopter'), (pid2, 'streak_7'),
  (pid3, 'early_adopter'),
  (pid4, 'early_adopter'), (pid4, 'streak_30'),
  (pid5, 'early_adopter')
ON CONFLICT DO NOTHING;

-- ── Get Room IDs ──────────────────────────────────────────
SELECT id INTO r_midnight FROM topic_rooms WHERE slug = 'midnight-thoughts';
SELECT id INTO r_career FROM topic_rooms WHERE slug = 'career-rants';
SELECT id INTO r_relationship FROM topic_rooms WHERE slug = 'relationship-chronicles';

-- ── Join rooms ────────────────────────────────────────────
IF r_midnight IS NOT NULL THEN
  INSERT INTO room_memberships (room_id, user_id) VALUES
    (r_midnight, pid1), (r_midnight, pid2), (r_midnight, pid5)
  ON CONFLICT DO NOTHING;
  UPDATE topic_rooms SET member_count = 3 WHERE id = r_midnight;
END IF;

IF r_career IS NOT NULL THEN
  INSERT INTO room_memberships (room_id, user_id) VALUES
    (r_career, pid2), (r_career, pid4)
  ON CONFLICT DO NOTHING;
  UPDATE topic_rooms SET member_count = 2 WHERE id = r_career;
END IF;

-- ── Follow relationships ──────────────────────────────────
INSERT INTO follows (follower_id, following_id) VALUES
  (pid1, pid2), (pid1, pid4),
  (pid2, pid1), (pid2, pid3),
  (pid3, pid1), (pid3, pid4),
  (pid4, pid2),
  (pid5, pid1), (pid5, pid2)
ON CONFLICT DO NOTHING;

-- ── Sample Posts ──────────────────────────────────────────
INSERT INTO posts (id, user_id, content, is_anonymous, is_mystery, city, latitude, longitude, tags, view_count, reveal_count, room_id)
VALUES
  (
    gen_random_uuid(), pid1,
    'It is 3am and I cannot stop thinking about how we are all just tiny specks in an infinite universe but somehow my chai tastes exactly right and that feels like enough 🌌',
    false, false, 'Mumbai', 19.0760, 72.8777, ARRAY['midnightthoughts', 'chai', 'philosophy'], 234, 0, r_midnight
  ),
  (
    gen_random_uuid(), pid2,
    'Unpopular opinion: Most "hustle culture" content is written by people who have never actually built anything. Real work is boring, repetitive, and mostly invisible. And that is okay.',
    false, false, 'Bangalore', 12.9716, 77.5946, ARRAY['startup', 'hustle', 'tech'], 567, 0, r_career
  ),
  (
    gen_random_uuid(), pid3,
    'Found this tiny biryani place in Old Delhi that has been run by the same family for 4 generations. The owner said his grandfather got the recipe from a royal kitchen. I cried a little. 🍚',
    false, false, 'Delhi', 28.6139, 77.2090, ARRAY['delhi', 'food', 'localsecrets'], 892, 0, NULL
  ),
  (
    gen_random_uuid(), NULL,
    'I told my manager my mental health needed a day off. He said "we all have bad days." I said "I know, that is why I am taking a day off." He went quiet. Small win. 🙂',
    true, false, 'Bangalore', 12.9716, 77.5946, ARRAY['mentalhealth', 'work', 'boundaries'], 1203, 0, r_career
  ),
  (
    gen_random_uuid(), pid4,
    'My startup failed. We burned through 18 months, 3 pivots, and too many late nights. Sharing what I learned — in case it helps someone.',
    false, false, 'Mumbai', 19.0600, 72.8400, ARRAY['startup', 'failure', 'lessons'], 2341, 0, r_career
  );

-- Mystery post
INSERT INTO posts (id, user_id, content, is_anonymous, is_mystery, city, latitude, longitude, tags, view_count, reveal_count)
VALUES (
  gen_random_uuid(), pid1,
  'I have been secretly applying to jobs abroad for 6 months without telling my family. Got an offer today. I do not know if I am excited or terrified. Probably both. 🌍',
  true, true, 'Mumbai', 19.0760, 72.8777, ARRAY['mystery', 'life', 'change'], 445, 127
);

-- Another mystery
INSERT INTO posts (id, user_id, content, is_anonymous, is_mystery, city, latitude, longitude, tags, view_count, reveal_count)
VALUES (
  gen_random_uuid(), pid5,
  'The person I have been talking to online for 2 years lives 5 minutes from me. We figured it out today by accident. I do not know what to do with this information.',
  true, true, 'Ahmedabad', 23.0225, 72.5714, ARRAY['mystery', 'connection', 'reallife'], 334, 89
);

-- ── Daily Challenge ───────────────────────────────────────
INSERT INTO daily_challenges (title, description, emoji, challenge_date, is_active)
VALUES (
  'Midnight Confession',
  'Share something you have been thinking about but never said out loud. Anonymous is fine.',
  '🌙',
  CURRENT_DATE,
  true
)
ON CONFLICT DO NOTHING;

-- ── Anonymous Questions (sample) ─────────────────────────
INSERT INTO anonymous_questions (target_user_id, question_text, is_answered)
VALUES
  (pid1, 'What do you think about at 3am that you cannot tell anyone?', false),
  (pid2, 'Did your startup fail? What happened?', false),
  (pid4, 'What was the hardest lesson from your startup?', false)
ON CONFLICT DO NOTHING;

-- ── Stories (active) ──────────────────────────────────────
INSERT INTO stories (user_id, content, bg_color, is_anonymous, is_mystery, mystery_reveal_threshold, expires_at)
VALUES
  (pid1, 'just realized everyone at this party is pretending to have a good time including me 🙃', '#1C1C26', false, false, 10, NOW() + INTERVAL '20 hours'),
  (pid2, 'shipped a feature today that took 2 weeks. nobody noticed. developer life. 💻', '#1a1a2e', false, false, 10, NOW() + INTERVAL '18 hours'),
  (pid5, NULL, '#6C63FF', true, true, 5, NOW() + INTERVAL '22 hours')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Seed data inserted successfully!';
RAISE NOTICE 'Test accounts:';
RAISE NOTICE '  test1@tryhushly.com / Test@1234 (Priya - Mumbai)';
RAISE NOTICE '  test2@tryhushly.com / Test@1234 (Rahul - Bangalore)';
RAISE NOTICE '  test3@tryhushly.com / Test@1234 (Aisha - Delhi)';
RAISE NOTICE '  test4@tryhushly.com / Test@1234 (Vikram - Mumbai)';
RAISE NOTICE '  test5@tryhushly.com / Test@1234 (Sneha - Ahmedabad)';

END $$;

-- ── Post counts update ────────────────────────────────────
UPDATE topic_rooms SET post_count = (
  SELECT COUNT(*) FROM posts WHERE room_id = topic_rooms.id AND is_deleted = false
) WHERE id IS NOT NULL;

RAISE NOTICE '✅ Seed complete. Now go to Supabase Auth dashboard and create these 5 test users.';

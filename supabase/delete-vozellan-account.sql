-- One-time cleanup requested by the account owner. Run in Supabase SQL Editor.
-- The foreign-key cascade also removes this user's profile, notes and activity.
delete from auth.users where email = 'vozellan@gmail.com';

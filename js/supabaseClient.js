// ============================================================
// Supabase client
// Replace these two values with your project's own credentials:
// Supabase Dashboard > Project Settings > API
// The anon key is safe to expose publicly — Row Level Security
// (defined in supabase/schema.sql) is what actually protects data.
// ============================================================
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

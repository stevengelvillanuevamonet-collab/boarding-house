// ============================================================
// Supabase client
// Replace these two values with your project's own credentials:
// Supabase Dashboard > Project Settings > API
// The anon key is safe to expose publicly — Row Level Security
// (defined in supabase/schema.sql) is what actually protects data.
// ============================================================
const SUPABASE_URL = "https://sjrouaebjgapeiivlgmq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MS0ZsRM6TXMUO3XenkJOfw_yhscB4pH";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

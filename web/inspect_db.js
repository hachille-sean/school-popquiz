const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function check() {
  const { data: sessions } = await supabase.from('exam_sessions').select('id, title, status').order('created_at', {ascending: false}).limit(5);
  console.log("Recent Sessions:\n", sessions);
  
  if (sessions && sessions.length > 0) {
    const activeSessionId = sessions.find(s => s.status === 'active')?.id || sessions[0].id;
    console.log(`\nFetching submissions for session ${activeSessionId}...`);
    const { data: subs, error } = await supabase.from('exam_submissions').select('*, popquiz_users(name)').eq('session_id', activeSessionId);
    console.log("Submissions:\n", subs);
    if(error) console.error("Error:\n", error);
  }
}
check();

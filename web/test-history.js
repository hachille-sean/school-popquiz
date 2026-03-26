const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function check() {
  console.log("Fetching all submissions via exact app query...");
  const { data, error } = await supabase.from('exam_submissions')
      .select('*, popquiz_users(name, student_number), exam_sessions(title, target_class, created_at, status)')
      .order('submitted_at', { ascending: false });
  
  if (error) {
    console.error("Supabase Error:", error);
  } else {
    console.log(`Successfully fetched ${data.length} submissions.`);
    if (data.length > 0) {
      console.log(JSON.stringify(data[0], null, 2));
    }
  }
}
check();

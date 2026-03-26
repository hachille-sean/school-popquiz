const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function clear() {
  console.log('Clearing old data including word pools...');
  await supabase.from('exam_submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('exam_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('exam_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('word_pools').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('Successfully cleared all previous exam sessions, templates, submissions, and word pools.');
}
clear();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function clearData() {
  console.log("Starting data deletion...");
  
  // Tables with foreign keys must be deleted first
  const tables = [
    'exam_submissions',
    'exam_templates',
    'exam_sessions',
    'word_pools',
    'popquiz_users'
  ];

  for (const table of tables) {
    console.log(`Clearing ${table}...`);
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`Error deleting from ${table}:`, error.message);
    }
  }
  console.log("All data cleared successfully!");
}

clearData().catch(console.error);

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MATCH_PHRASE = 'If you ever come to China for sourcing';

const NEW_BODY_TAIL = `if you're ever in Guangdong on a sourcing trip — we'd love to host you at the factory.

we cover airport pickup, factory tour, meals. you sort flight and hotel.

most builders see 4-5 factories in a trip. ours is worth one of those slots.

which month are you next in China?

{{accountSignature}}`;

const NEW_SUBJECT = 'a thought on your next sourcing trip';

(async () => {
  const { data, error } = await db
    .from('leads')
    .select('id, email4_body')
    .ilike('email4_body', `%${MATCH_PHRASE}%`);

  if (error) {
    console.error('Fetch failed:', error.message);
    process.exit(1);
  }
  console.log(`Found ${data.length} matching rows.`);

  let updated = 0;
  let failed  = 0;
  for (const row of data) {
    const firstLine = (row.email4_body || '').split('\n')[0];
    const newBody   = firstLine + '\n\n' + NEW_BODY_TAIL;
    const { error: updErr } = await db
      .from('leads')
      .update({ email4_body: newBody, email4_subject: NEW_SUBJECT })
      .eq('id', row.id);
    if (updErr) {
      console.error(`  ✗ id=${row.id}: ${updErr.message}`);
      failed++;
    } else {
      updated++;
    }
  }

  console.log(`\n✓ Updated: ${updated}`);
  if (failed) console.log(`✗ Failed:  ${failed}`);
})();

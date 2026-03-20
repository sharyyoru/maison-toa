import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables. Make sure .env.local contains:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function mergeAbandonedStages() {
  console.log('Fetching abandoned/unanswered stages...');
  
  // Find all stages that match abandoned/unanswered pattern
  const { data: stages, error } = await supabase
    .from('deal_stages')
    .select('id, name, sort_order')
    .or('name.ilike.%abandoned%,name.ilike.%unanswered%');

  if (error) {
    console.error('Error fetching stages:', error);
    return;
  }

  console.log('Found stages:', stages);

  if (!stages || stages.length <= 1) {
    console.log('No duplicate stages found to merge.');
    return;
  }

  // Keep the first one (or the one with "abandoned / unanswered" with spaces)
  const keepStage = stages.find(s => s.name.toLowerCase() === 'abandoned / unanswered') || stages[0];
  const deleteStages = stages.filter(s => s.id !== keepStage.id);

  console.log(`Keeping stage: "${keepStage.name}" (${keepStage.id})`);
  console.log(`Stages to merge and delete:`, deleteStages.map(s => `"${s.name}" (${s.id})`));

  // Update all deals that reference the stages to be deleted
  for (const stageToDelete of deleteStages) {
    console.log(`Moving deals from "${stageToDelete.name}" to "${keepStage.name}"...`);
    
    const { error: updateError, count } = await supabase
      .from('deals')
      .update({ stage_id: keepStage.id, updated_at: new Date().toISOString() })
      .eq('stage_id', stageToDelete.id);

    if (updateError) {
      console.error(`Error updating deals for stage ${stageToDelete.name}:`, updateError);
    } else {
      console.log(`Updated deals from "${stageToDelete.name}"`);
    }
  }

  // Delete the duplicate stages
  for (const stageToDelete of deleteStages) {
    console.log(`Deleting stage: "${stageToDelete.name}"...`);
    
    const { error: deleteError } = await supabase
      .from('deal_stages')
      .delete()
      .eq('id', stageToDelete.id);

    if (deleteError) {
      console.error(`Error deleting stage ${stageToDelete.name}:`, deleteError);
    } else {
      console.log(`Deleted stage: "${stageToDelete.name}"`);
    }
  }

  console.log('Merge complete!');
}

mergeAbandonedStages();

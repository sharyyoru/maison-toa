import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const STAGE_ORDER = [
  'request for information',
  'appointment set',
  'moment reflection',
  'image pending',
  'request for insurance support',
  'operation scheduled',
  'closed won',
  'closed lost',
  'abandoned / unanswered'
];

async function updateStageOrder() {
  console.log('Fetching current stages...');
  
  const { data: stages, error } = await supabase
    .from('deal_stages')
    .select('id, name, sort_order');

  if (error) {
    console.error('Error fetching stages:', error);
    return;
  }

  console.log('Current stages:', stages);

  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const stageName = STAGE_ORDER[i];
    const stage = stages?.find(s => s.name.toLowerCase() === stageName.toLowerCase());
    
    if (stage) {
      const newSortOrder = i + 1;
      console.log(`Updating "${stage.name}" to sort_order ${newSortOrder}`);
      
      const { error: updateError } = await supabase
        .from('deal_stages')
        .update({ sort_order: newSortOrder })
        .eq('id', stage.id);

      if (updateError) {
        console.error(`Error updating ${stage.name}:`, updateError);
      }
    } else {
      console.warn(`Stage not found: ${stageName}`);
    }
  }

  console.log('Stage order update complete!');
}

updateStageOrder();

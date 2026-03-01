import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://onbojolpltzjyyruwevk.supabase.co'; 
const supabaseKey = 'sb_publishable_nnekCIGPL0oQUPyUt5_tVQ_5g6GGAxD'; 

export const supabase = createClient(supabaseUrl, supabaseKey); 
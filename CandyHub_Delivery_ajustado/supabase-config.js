/* Configuração do Supabase para o CandyHub Delivery.
   A chave publishable é própria para uso no navegador.
   Nunca coloque uma chave secret ou service_role neste arquivo. */
const SUPABASE_URL = 'https://abffchuykfoaryltlxmt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l7ZoV5jUI_RYXYPI9N1FKA_hQUFv1Ov';

const supabaseConfigReady = Boolean(
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_PUBLISHABLE_KEY.length > 20 &&
  !SUPABASE_PUBLISHABLE_KEY.includes('COLE_AQUI')
);

const supabaseClient = (
  supabaseConfigReady && window.supabase &&
  typeof window.supabase.createClient === 'function'
) ? window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
) : null;

// O script.js usa window.supabaseClient; esta atribuição é essencial.
window.supabaseClient = supabaseClient;

if (!supabaseConfigReady) {
  console.error('A chave pública do Supabase não está configurada corretamente.');
} else if (!window.supabase) {
  console.error('A biblioteca do Supabase não foi carregada. Verifique sua conexão e o CDN.');
}

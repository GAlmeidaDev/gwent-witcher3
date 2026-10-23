// Configuração pública do site. A chave "publishable" do Supabase é feita para ficar no navegador:
// quem protege os dados é o RLS (veja supabase/schema.sql), não o sigilo da chave.
window.APP_CONFIG = {
  supabaseUrl: 'https://iismmjpaydwdzblzaxkq.supabase.co',
  supabaseKey: 'sb_publishable_LYw2tQi232x-NOJm50jPWw_b5mbSZJS',
  // Tiles do mapa: no GitHub Pages ficam na própria raiz do site ('.'); em localhost lê do Pages publicado.
  mapsBase: ['localhost', '127.0.0.1'].includes(location.hostname) ? 'https://galmeidadev.github.io/gwent-witcher3' : '.',
};

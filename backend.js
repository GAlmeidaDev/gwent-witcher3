// Acesso ao Supabase (login por e-mail e progresso por usuário). Tudo roda no navegador.
const cfg = window.APP_CONFIG ?? {};
export const configured = Boolean(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

/** Converte erros do Supabase em códigos que a interface traduz (ui.errors.<código>). */
function fail(error) {
  const msg = String(error?.message ?? '').toLowerCase();
  const code =
    !configured ? 'not_configured'
    : error?.status === 429 || msg.includes('rate limit') ? 'too_many_attempts'
    : msg.includes('invalid login') ? 'invalid_credentials'
    : msg.includes('already registered') || msg.includes('already been registered') ? 'email_taken'
    : msg.includes('email not confirmed') ? 'email_not_confirmed'
    : msg.includes('password') && (msg.includes('least') || msg.includes('weak') || msg.includes('short')) ? 'bad_password'
    : msg.includes('valid email') || msg.includes('invalid email') || msg.includes('invalid format') ? 'bad_email'
    : msg.includes('same password') ? 'same_password'
    : msg.includes('jwt') || msg.includes('not authenticated') || msg.includes('session') ? 'unauthenticated'
    : 'generic';
  throw Object.assign(new Error(error?.message ?? code), { code });
}
const check = ({ data, error }) => { if (error) fail(error); return data; };
const needSb = () => { if (!sb) fail(null); return sb; };

const toUser = (u) => (u ? { id: u.id, email: u.email, name: u.user_metadata?.username || u.email?.split('@')[0] } : null);

export async function currentUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return toUser(data.session?.user);
}

export async function signIn(email, password) {
  const data = check(await needSb().auth.signInWithPassword({ email, password }));
  return toUser(data.user);
}

/** Retorna o usuário logado, ou null quando o projeto exige confirmação por e-mail. */
export async function signUp(email, password, username) {
  const data = check(await needSb().auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: location.origin + location.pathname } }));
  // e-mail já cadastrado: o Supabase devolve um usuário "falso" sem identidades
  if (data.user && data.user.identities?.length === 0) fail({ message: 'User already registered' });
  return data.session ? toUser(data.user) : null;
}

export async function signOut() { check(await needSb().auth.signOut()); }

export async function sendReset(email) {
  check(await needSb().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
}

export async function updatePassword(password) {
  const data = check(await needSb().auth.updateUser({ password }));
  return toUser(data.user);
}

/** Chamado quando o usuário abre o link de redefinição recebido por e-mail. */
export function onPasswordRecovery(cb) {
  if (!sb) return;
  sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') cb(); });
}

export async function loadProgress() {
  const rows = check(await needSb().from('progress').select('card_id'));
  return new Set(rows.map((r) => r.card_id));
}

export async function setCollected(cardId, collected) {
  const client = needSb();
  if (collected) check(await client.from('progress').upsert({ card_id: cardId }, { onConflict: 'user_id,card_id', ignoreDuplicates: true }));
  else check(await client.from('progress').delete().eq('card_id', cardId));
}

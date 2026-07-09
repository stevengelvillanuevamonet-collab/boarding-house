// ============================================================
// Auth helpers shared across pages
// ============================================================

/** Redirect the current user to the right dashboard based on role. */
async function redirectToDashboard() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) return;

  if (profile.role === 'admin') {
    window.location.href = '/admin/index.html';
  } else {
    window.location.href = '/tenant/index.html';
  }
}

/** Guard a page: redirect to login if not authenticated, else return the profile. */
async function requireAuth(expectedRole) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) {
    window.location.href = '/index.html';
    return null;
  }

  if (expectedRole && profile.role !== expectedRole) {
    // Logged in, but wrong dashboard for their role — send them to the right one.
    window.location.href = profile.role === 'admin' ? '/admin/index.html' : '/tenant/index.html';
    return null;
  }

  return profile;
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}

// ------------------------------------------------------------
// Login form (index.html)
// ------------------------------------------------------------
function initLoginForm() {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    const email = form.email.value.trim();
    const password = form.password.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      errorEl.textContent = 'Incorrect email or password. Please try again.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
      return;
    }

    await redirectToDashboard();
  });

  // If already logged in, skip straight to dashboard.
  redirectToDashboard();
}

document.addEventListener('DOMContentLoaded', initLoginForm);

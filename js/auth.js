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

// ------------------------------------------------------------
// Sign-up form (index.html) — tenants create their own account.
// Their profile is auto-created with role='tenant' by the
// handle_new_user trigger; the admin still has to assign them
// a room afterward from the Tenants tab.
// ------------------------------------------------------------
function initSignupForm() {
  const form = document.getElementById('signup-form');
  const errorEl = document.getElementById('signup-error');
  const successEl = document.getElementById('signup-success');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    successEl.textContent = '';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    const full_name = document.getElementById('signup_full_name').value.trim();
    const email = document.getElementById('signup_email').value.trim();
    const password = document.getElementById('signup_password').value;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';

    if (error) {
      errorEl.textContent = error.message.includes('already registered')
        ? 'An account with that email already exists. Try signing in instead.'
        : 'Could not create the account. Please check your details and try again.';
      return;
    }

    // If email confirmation is off in Supabase, signUp already returns
    // a live session, so we can go straight to the dashboard.
    if (data.session) {
      await redirectToDashboard();
      return;
    }

    // Otherwise Supabase requires clicking a confirmation link first.
    form.reset();
    successEl.textContent = 'Account created! Check your email to confirm it, then sign in.';
  });
}

// ------------------------------------------------------------
// Toggle between the login and sign-up panels
// ------------------------------------------------------------
function initAuthPanelToggle() {
  const loginPanel = document.getElementById('login-panel');
  const signupPanel = document.getElementById('signup-panel');
  const showSignup = document.getElementById('show-signup');
  const showLogin = document.getElementById('show-login');
  if (!loginPanel || !signupPanel) return;

  showSignup?.addEventListener('click', (e) => {
    e.preventDefault();
    loginPanel.style.display = 'none';
    signupPanel.style.display = 'block';
  });
  showLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    signupPanel.style.display = 'none';
    loginPanel.style.display = 'block';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLoginForm();
  initSignupForm();
  initAuthPanelToggle();
});

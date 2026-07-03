// ============================================
// REEL IT — auth.js
// Magic-link sign-in via Supabase. The anon key below is meant to be
// public (it only works within the RLS rules you set in Supabase) —
// replace the two values with your own project's before deploying.
// ============================================

const SUPABASE_URL = "https://obrdjwndjpviyjoenjuj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_vPomdt-XdZm_ZFt4FtWF2w_OFMde7Fj";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authEls = {
  passGate: document.getElementById("passGate"),
  passEmail: document.getElementById("passEmail"),
  passSendBtn: document.getElementById("passSendBtn"),
  passStatus: document.getElementById("passStatus"),
  slate: document.getElementById("slate"),
  rollBtn: document.getElementById("rollBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  creditsLeft: document.getElementById("creditsLeft"),
};

// Exposed for app.js — it never talks to Supabase directly, only
// through these two functions, so all the auth logic stays in one file.
window.ReelAuth = {
  getAccessToken: async () => {
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.access_token || null;
  },
  refreshCredits: refreshCreditsFromServer,
};

authEls.passSendBtn.addEventListener("click", async () => {
  const email = authEls.passEmail.value.trim();
  if (!email || !email.includes("@")) {
    authEls.passStatus.textContent = "That doesn't look like an email yet.";
    return;
  }
  authEls.passSendBtn.disabled = true;
  authEls.passStatus.textContent = "Sending your pass…";

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });

  if (error) {
  console.error("Supabase Error:", error);

  authEls.passStatus.textContent =
    `Error: ${error.message}`;

  authEls.passSendBtn.disabled = false;
  return;
}
  authEls.passStatus.textContent = `Pass sent to ${email}. Check your inbox.`;
});

authEls.signOutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showSignedIn();
    refreshCreditsFromServer();
  } else {
    showSignedOut();
  }
});

function showSignedIn() {
  authEls.passGate.hidden = true;
  authEls.slate.hidden = false;
  authEls.rollBtn.hidden = false;
  authEls.signOutBtn.hidden = false;
}

function showSignedOut() {
  authEls.passGate.hidden = false;
  authEls.slate.hidden = true;
  authEls.rollBtn.hidden = true;
  authEls.signOutBtn.hidden = true;
}

async function refreshCreditsFromServer() {
  const token = await window.ReelAuth.getAccessToken();
  if (!token) return;
  try {
    const res = await fetch("/.netlify/functions/get-profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    authEls.creditsLeft.textContent = data.rollsLeft > 0
      ? `${data.rollsLeft} free roll${data.rollsLeft === 1 ? "" : "s"} left`
      : "Out of free rolls — upgrade to keep shooting";
    authEls.rollBtn.disabled = data.rollsLeft <= 0;
  } catch {
    // silent — credits label just won't update this round
  }
}

// initial state while Supabase checks for an existing session
showSignedOut();

// Supabase-based auth + compatibility wrappers for existing pages
// Assumes you include the Supabase UMD script and config.js (which sets window.supabaseClient)
// in your <head> before this module loads.

const supabase = window.supabaseClient || (window.supabase && window.supabase.createClient && window.supabase) || null;
if (!supabase) console.warn('[Auth] supabase client not found. Make sure to load supabase UMD + config.js before auth.js');

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

export async function signInWithGoogle() {
    if (!supabase) throw new Error('Supabase client not initialized');
    try {
        // Redirect back to the same page after sign-in so user stays on current page
        const redirectTo = window.location.href;
        // Use options.redirectTo (supabase-js v2) to request returning to the current page
        // and request Google to limit accounts to the DIU organization and force account selection.
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                // Query params are forwarded to the provider. 'hd' requests hosted domain
                // and 'prompt' forces account chooser. Note: hd is a hint and must be enforced server-side.
                queryParams: {
                    hd: 'diu.edu.bd',
                    prompt: 'select_account'
                }
            }
        });
    } catch (e) {
        console.error('[Auth] signInWithGoogle', e);
        console.warn('[Auth] signInWithGoogle: ensure the redirect URL is listed in Supabase OAuth settings', window.location.href);
        throw e;
    }
}

// Sign in and redirect to a specific URL after sign-in
export async function signInAndRedirect(redirectTo) {
    if (!supabase) throw new Error('Supabase client not initialized');
    try {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                queryParams: {
                    hd: 'diu.edu.bd',
                    prompt: 'select_account'
                }
            }
        });
    } catch (e) {
        console.error('[Auth] signInAndRedirect', e);
        throw e;
    }
}

// Validate that the signed-in user's email belongs to the allowed domain(s).
// If not, sign them out immediately and show a short message.
const ALLOWED_EMAIL_DOMAIN = 'diu.edu.bd';
async function validateUserDomain(user) {
    try {
        if (!user || !user.email) return true; // nothing to validate
        const email = String(user.email || '').toLowerCase();
        if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
            // Not allowed — sign them out and notify
            console.warn('[Auth] disallowed email domain:', email);
            try { await supabase.auth.signOut(); } catch(_){}
            try { localStorage.removeItem('user_info'); } catch(_){}
            updateUI(null);
            alert('Only DIU accounts ("@diu.edu.bd") are allowed to sign in. Your account was signed out.');
            return false;
        }
        return true;
    } catch (e) {
        console.error('[Auth] validateUserDomain', e);
        return false;
    }
}

export async function signOutUser() {
    if (!supabase) throw new Error('Supabase client not initialized');
    try {
        await supabase.auth.signOut();
        // clear local cached profile and session keys used across the app
        try { localStorage.removeItem('user_info'); } catch (_) {}
        try { localStorage.removeItem('google_credential'); } catch (_) {}
        try { localStorage.removeItem('diuProfile'); } catch (_) {}
        try { localStorage.removeItem('user_profile'); } catch (_) {}
        updateUI(null);
        try { window.dispatchEvent(new CustomEvent('auth-ready', { detail: { user: null } })); } catch(_){}
    } catch (e) {
        console.error('[Auth] signOutUser', e);
        throw e;
    }
}

export function requireAuth(fn) {
    return async function(...args) {
        const s = await supabase?.auth.getSession();
        const user = s?.data?.session?.user ?? null;
        if (!user) {
            await signInWithGoogle();
            return;
        }
        return fn.apply(this, args);
    };
}

function formatUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
        avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null
    };
}

function updateUI(userObj) {
    const user = userObj && userObj.id ? formatUser(userObj) : userObj && userObj.user ? formatUser(userObj.user) : null;
    try { localStorage.setItem('user_info', JSON.stringify(user || {})); } catch (_){}

    const userNameEl = document.getElementById('userName') || $('.userName');
    const avatarEl = document.getElementById('navUserAvatarImg') || $('.user-avatar-img');
    const signInBtns = $$('.btn-auth-primary, .btn-auth-secondary, .sign-in, .sign-in-btn');
    const signOutEls = $$('.sign-out, .sign-out-btn, .logout');
    const userMenuCards = $$('.user-menu-card, .user-profile');
    const dropdownLogin = document.getElementById('dropdownLogin');
    const dropdownLogout = document.getElementById('dropdownLogout');

    if (userNameEl) userNameEl.textContent = user ? (user.name || user.email) : 'Guest User';
    if (avatarEl) {
        if (user && user.avatar) {
            avatarEl.src = user.avatar;
            avatarEl.classList.remove('hidden');
        } else {
            avatarEl.classList.add('hidden');
        }
    }
    // Show or hide sign-in buttons
    signInBtns.forEach(b => { try { b.style.display = user ? 'none' : ''; } catch(_) {} });
    // Show or hide sign-out elements
    signOutEls.forEach(el => { try { el.style.display = user ? '' : 'none'; } catch(_) {} });
    // Toggle dropdown login/logout blocks if present
    if (dropdownLogin) dropdownLogin.classList.toggle('hidden', !!user);
    if (dropdownLogout) dropdownLogout.classList.toggle('hidden', !user);
    // Keep the user-menu container visible on all pages; toggle internal login/logout blocks instead
    userMenuCards.forEach(c => { try { c.style.display = ''; } catch(_) {} });
    // Ensure nav-right items are visible when signed-out (some pages use different markup)
    const navRight = document.querySelector('.nav-right');
    if (navRight) {
        try { navRight.style.display = user ? '' : ''; } catch(_) {}
    }

    // Debugging: log counts if running in dev console
    try {
        console.debug('[Auth:updateUI]', { user, signInBtns: signInBtns.length, signOutEls: signOutEls.length, userMenuCards: userMenuCards.length, navRight: !!navRight });
    } catch (_) {}

    // Hide settings links for non-authenticated users
    try {
        const settingsLinks = document.querySelectorAll('a[href$="settings.html"], a[href*="/settings.html"]');
        settingsLinks.forEach(el => { try { el.style.display = user ? '' : 'none'; } catch(_) {} });
    } catch (_) {}
}

if (supabase) {
    supabase.auth.getSession().then(res => {
        const user = res?.data?.session?.user ?? null;
        (async () => {
            const ok = await validateUserDomain(user);
            if (ok) updateUI(user); else updateUI(null);
            try { window.dispatchEvent(new CustomEvent('auth-ready', { detail: { user: ok ? user : null } })); } catch (_) {}
        })();
    }).catch(e => console.warn('[Auth] getSession', e));

    supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user ?? null;
        (async () => {
            const ok = await validateUserDomain(user);
            if (ok) updateUI(user); else updateUI(null);
            try { window.dispatchEvent(new CustomEvent('auth-ready', { detail: { user: ok ? user : null } })); } catch (_) {}
        })();
    });
}

window.FirebaseAPI = window.FirebaseAPI || {};

window.FirebaseAPI.getJobs = async function() {
    if (!supabase) throw new Error('Supabase client not initialized');
    try {
        const { data, error } = await supabase.from('jobs').select('*').order('posted_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('[SupabaseAPI] getJobs', e);
        throw e;
    }
};

window.FirebaseAPI.createJob = async function(job) {
    if (!supabase) throw new Error('Supabase client not initialized');
    try {
        const payload = { ...job, posted_at: job.posted_at || new Date().toISOString() };
        const { data, error } = await supabase.from('jobs').insert([payload]).select().single();
        if (error) throw error;
        return data;
    } catch (e) {
        console.error('[SupabaseAPI] createJob', e);
        throw e;
    }
};

window.FirebaseAPI.getEducationOpportunities = async function() {
    if (!supabase) throw new Error('Supabase client not initialized');
    try {
        const { data, error } = await supabase.from('education_opportunities').select('*').order('posted_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('[SupabaseAPI] getEducationOpportunities', e);
        throw e;
    }
};

window.FirebaseAPI.createEducationOpportunity = async function(op) {
    if (!supabase) throw new Error('Supabase client not initialized');
    try {
        const payload = { ...op, posted_at: op.posted_at || new Date().toISOString() };
        const { data, error } = await supabase.from('education_opportunities').insert([payload]).select().single();
        if (error) throw error;
        return data;
    } catch (e) {
        console.error('[SupabaseAPI] createEducationOpportunity', e);
        throw e;
    }
};

window.getCurrentUser = async function() {
    if (!supabase) return null;
    try {
        const s = await supabase.auth.getSession();
        return s?.data?.session?.user ?? null;
    } catch (e) {
        console.warn('[Auth] getCurrentUser', e);
        return null;
    }
};

// Expose auth helpers to global scope for non-module scripts
window.signInWithGoogle = signInWithGoogle;
window.signOutUser = signOutUser;
window.requireAuth = requireAuth;
window.diuAuth = window.diuAuth || {};
window.diuAuth.signInWithGoogle = signInWithGoogle;
window.diuAuth.signOutUser = signOutUser;
window.diuAuth.getCurrentUser = window.getCurrentUser;
window.diuAuth.auth = supabase;
// expose redirect helper globally as well
window.signInAndRedirect = signInAndRedirect;
window.diuAuth.signInAndRedirect = signInAndRedirect;

// If a return URL was stored prior to sign-in, and auth is now ready with a user, navigate.
window.addEventListener('auth-ready', async (ev) => {
    try {
        const returnTo = localStorage.getItem('auth_return_to');
        const user = ev?.detail?.user ?? await window.getCurrentUser?.();
        if (returnTo && user) {
            localStorage.removeItem('auth_return_to');
            // Only navigate if different
            if (window.location.href !== returnTo) window.location.href = returnTo;
        }
    } catch (e) { console.warn('[Auth] return-to handler', e); }
});

function wireButtons() {
    const googleBtns = $$('.btn-auth-primary, .btn-auth-secondary, .sign-in, .sign-in-btn');
    googleBtns.forEach(b => b.addEventListener('click', async (e) => {
        e.preventDefault();
        await signInWithGoogle();
    }));
    const signOutEls = $$('.sign-out, .sign-out-btn, .logout');
    signOutEls.forEach(el => el.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await signOutUser();
        } catch (err) {
            console.warn('signOut failed', err);
        }
    }));
}

// Protect certain links by requiring authentication. If the user is not signed in,
// start sign-in and request redirect back to the intended target.
function protectLinks() {
    // Protect blog links site-wide
    const blogLinks = Array.from(document.querySelectorAll('a[href$="blog.html"], a[href*="/blog.html"]'));
    blogLinks.forEach(a => {
        // avoid double-binding
        if (a.__protected_by_auth) return;
        a.__protected_by_auth = true;
        a.addEventListener('click', async (ev) => {
            try {
                const user = await window.getCurrentUser?.();
                if (user) return; // already signed in — allow navigation
                ev.preventDefault();
                const target = a.href || (new URL('blog.html', window.location.href)).href;
                // Initiate sign-in and ask Supabase to redirect to the blog page after auth
                try {
                    await signInAndRedirect(target);
                } catch (err) {
                    console.warn('sign-in redirect failed', err);
                    // fallback: save target and call normal sign-in (which returns to current page)
                    try { localStorage.setItem('auth_return_to', target); } catch(_){}
                    await signInWithGoogle();
                }
            } catch (e) {
                console.error('protect link', e);
            }
        });
    });
}

// Run protections once DOM is ready and also when auth becomes ready
document.addEventListener('DOMContentLoaded', () => {
    try { protectLinks(); } catch(_){}
});
window.addEventListener('auth-ready', () => { try { protectLinks(); } catch(_){} });

document.addEventListener('DOMContentLoaded', () => { try { wireButtons(); } catch(_) {} });

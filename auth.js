
// Unified Google Auth logic for all pages
// Uses Firebase Web v12 modular SDK via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { 
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    signOut,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp,
    getDocs,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// IMPORTANT: public client config (safe to expose)
const firebaseConfig = {
    apiKey: "AIzaSyDAotyAzqdjCCSITUu0Bq5bqehNogINeQc",
    authDomain: "test-project-71e8e.firebaseapp.com",
    projectId: "test-project-71e8e",
    storageBucket: "test-project-71e8e.firebasestorage.app",
    messagingSenderId: "973240352150",
    appId: "1:973240352150:web:1ed0bcfc65856445a5b1b7",
    measurementId: "G-LB479ZS7ZV"
};

// Init
const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch { /* analytics optional (ignored in http / no consent) */ }
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(e=>console.warn('[Auth] setPersistence failed', e));
// Firestore
const db = getFirestore(app);

// Provider
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// Shorthand selectors
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// ---- Sign-in / Sign-out handlers ----
export async function signInWithGoogle() {
    console.log('[Auth] signInWithGoogle');
    // Prevent duplicate popup requests
    if (window.__diuSigningIn) return;
    window.__diuSigningIn = true;
    try {
        await signInWithPopup(auth, provider);
        console.log('[Auth] Popup success', auth.currentUser?.uid);
    } catch (err) {
        window.lastAuthErr = err;
        console.error('[Auth] Popup failed', err);
        const code = err?.code;
        if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
            console.warn('[Auth] Falling back to redirect');
            try { await signInWithRedirect(auth, provider); return; } catch(r2){ console.error('[Auth] Redirect also failed', r2); }
        }
        alert(`Google sign-in failed${code?` ( ${code} )`:''}. See console.`);
    } finally {
        window.__diuSigningIn = false;
    }
}

export async function signOutUser() {
    try {
        await signOut(auth);
    } catch (e) {
        console.error('[Auth] signOut error', e);
    } finally {
        try {
            localStorage.removeItem('user_info');
            localStorage.removeItem('google_credential');
        } catch {}
    }
}

export function requireAuth(fn) {
    if (auth.currentUser) return fn();
    return signInWithGoogle();
}

// ---- UI update ----
function updateUI(user){
    const nameEls = $$('#userName, #profileName, #navUserName, #postAuthorName');
    const avatarEls = $$('#userAvatar, #createPostAvatar');
    const avatarImg = $('#userAvatarImg');
    const avatarLetter = $('#userAvatarLetter');
    const navAvatarImg = $('#navUserAvatarImg');
    const navUserIcon = $('#navUserIcon');
    const signInBtns = $$('.sign-in-btn');
    const signOutBtns = $$('.sign-out-btn');
    const dropdownLogin = $('#dropdownLogin');
    const dropdownLogout = $('#dropdownLogout');
    const isHome = document.body?.classList.contains('home-page');
    if (user){
        const displayName = user.displayName || user.email || 'User';
        nameEls.forEach(el=> el && (el.textContent = displayName));
        if (user.photoURL){
            // Main sidebar avatar uses img element; createPostAvatar uses background
            avatarEls.forEach(el=>{ if(!el) return; if(el.id==='createPostAvatar'){ el.style.backgroundImage=`url(${user.photoURL})`; el.style.backgroundSize='cover'; el.textContent=''; } });
            if (avatarImg && avatarLetter){
                avatarImg.src = user.photoURL;
                avatarImg.style.display='block';
                avatarLetter.style.display='none';
            }
            if (navAvatarImg && navUserIcon){
                navAvatarImg.src = user.photoURL;
                navAvatarImg.style.display='block';
                navUserIcon.style.display='none';
            }
        } else {
            // No photo: show initials / letter
            avatarEls.forEach(el=>{ if(!el) return; el.style.backgroundImage=''; el.textContent = displayName[0].toUpperCase(); });
            if (avatarImg && avatarLetter){
                avatarImg.style.display='none';
                avatarLetter.style.display='block';
                avatarLetter.textContent = displayName[0].toUpperCase();
            }
            if (navAvatarImg && navUserIcon){
                navAvatarImg.style.display='none';
                navUserIcon.style.display='inline-block';
            }
        }
        if (!isHome) signInBtns.forEach(b=> b.style.display='none');
        signOutBtns.forEach(b=> b.style.display='inline-block');
        if (dropdownLogin) dropdownLogin.style.display='none';
        if (dropdownLogout) dropdownLogout.style.display='block';
    } else {
        nameEls.forEach(el=> el && (el.textContent = 'Guest User'));
    avatarEls.forEach(el=>{ if(!el) return; el.style.backgroundImage=''; el.textContent='U'; });
    if (avatarImg && avatarLetter){ avatarImg.style.display='none'; avatarLetter.style.display='block'; avatarLetter.textContent='U'; }
    if (navAvatarImg && navUserIcon){ navAvatarImg.style.display='none'; navUserIcon.style.display='inline-block'; }
        if (!isHome) signInBtns.forEach(b=> b.style.display='inline-block');
        signOutBtns.forEach(b=> b.style.display='none');
        if (dropdownLogin) dropdownLogin.style.display='block';
        if (dropdownLogout) dropdownLogout.style.display='none';
    }
}

// ---- Event wiring ----
function wireButtons(){
    $$('.sign-in-btn').forEach(btn=> btn.addEventListener('click', e=>{ e.preventDefault(); signInWithGoogle(); }));
    $$('.sign-out-btn').forEach(btn=> btn.addEventListener('click', e=>{ e.preventDefault(); signOutUser(); }));
    // Gated generic handler for any element with requires-auth
    document.body.addEventListener('click', e => {
        const t = e.target.closest('.requires-auth');
        if (!t) return;
        if (!auth.currentUser){ e.preventDefault(); signInWithGoogle(); }
    });
    // Auto-tag known interactive IDs
    // Only auto-tag general post buttons (avoid jobs button to prevent double handlers)
    ['#newPostBtn','#newPostBtn2'].forEach(sel=>{ const el=$(sel); if(el) el.classList.add('requires-auth'); });
}

// ---- Auth state / Redirect result ----
onAuthStateChanged(auth, user => {
    console.log('[Auth] state', user?.uid || null);
    // Persist minimal user profile for pages that rely on localStorage
    try {
        if (user) {
            const info = {
                uid: user.uid,
                displayName: user.displayName || null,
                email: user.email || null,
                photoURL: user.photoURL || null
            };
            localStorage.setItem('user_info', JSON.stringify(info));
        } else {
            localStorage.removeItem('user_info');
        }
    } catch {}
    updateUI(user);
});
getRedirectResult(auth).then(r=>{ if(r?.user) console.log('[Auth] redirect success', r.user.uid); }).catch(e=> console.error('[Auth] redirect error', e));

// ---- Init after DOM ready ----
if (document.readyState !== 'loading') wireButtons(); else document.addEventListener('DOMContentLoaded', wireButtons);

// Expose for debug
window.diuAuth = { auth, signInWithGoogle, signOutUser, requireAuth };

// ---- Minimal Jobs API (Firestore) ----
const ok = (data) => ({ ok: true, json: async () => data });
const err = (message) => ({ ok: false, json: async () => ({ error: message }) });

async function createJob(job){
    try {
        const payload = { ...job, posted_at: serverTimestamp() };
        const docRef = await addDoc(collection(db, 'jobs'), payload);
        return ok({ id: docRef.id });
    } catch (e) {
        console.error('[FirebaseAPI] createJob error', e);
        return err(e?.message || 'createJob failed');
    }
}

async function getJobs(){
    try {
        const q = query(collection(db, 'jobs'), orderBy('posted_at', 'desc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                ...d,
                posted_at: d.posted_at?.toDate ? d.posted_at.toDate().toISOString() : new Date().toISOString()
            };
        });
        return ok(list);
    } catch (e) {
        console.error('[FirebaseAPI] getJobs error', e);
        return err(e?.message || 'getJobs failed');
    }
}

window.FirebaseAPI = window.FirebaseAPI || {};
window.FirebaseAPI.createJob = createJob;
window.FirebaseAPI.getJobs = getJobs;

// ---- Education Opportunities API (Firestore) ----
async function createEducationOpportunity(data){
    try {
        const payload = { ...data, posted_at: serverTimestamp() };
        const docRef = await addDoc(collection(db, 'education_opportunities'), payload);
        return { id: docRef.id };
    } catch (e) {
        console.error('[FirebaseAPI] createEducationOpportunity error', e);
        throw new Error(e?.message || 'createEducationOpportunity failed');
    }
}

async function getEducationOpportunities(){
    try {
        const q = query(collection(db, 'education_opportunities'), orderBy('posted_at', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                ...d,
                posted_at: d.posted_at?.toDate ? d.posted_at.toDate().toISOString() : new Date().toISOString()
            };
        });
    } catch (e) {
        console.error('[FirebaseAPI] getEducationOpportunities error', e);
        throw new Error(e?.message || 'getEducationOpportunities failed');
    }
}

window.FirebaseAPI.createEducationOpportunity = createEducationOpportunity;
window.FirebaseAPI.getEducationOpportunities = getEducationOpportunities;

// Firestore post handling with heading, attachments & profile completeness gate
import { getApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const postsCol = collection(db, 'posts');
const postsContainer = document.getElementById('postsContainer');
const modal = document.getElementById('postModal');
const postContentEl = document.getElementById('postContent');
const postHeadingEl = document.getElementById('postHeading');
const imagesInput = document.getElementById('postImages');
const videosInput = document.getElementById('postVideos');
const attachmentList = document.getElementById('attachmentList');
const profileIncompleteMsg = document.getElementById('profileIncompleteMsg');
const postErr = document.getElementById('postError');
const postAuthorNameEl = document.getElementById('postAuthorName');

function profileData() { try { return JSON.parse(localStorage.getItem('diuProfile') || '{}'); } catch { return {}; } }
function isProfileComplete() { const p = profileData(); return !!(p.displayName && p.role && p.department && p.institution); }

function openModal() {
    if (!auth.currentUser) return;
    postErr.style.display = 'none';
    profileIncompleteMsg && (profileIncompleteMsg.style.display = 'none');
    const tpl = document.getElementById('postTemplate');
    postContentEl.value = '';
    if (postHeadingEl) postHeadingEl.value = '';
    if (attachmentList) { attachmentList.innerHTML = ''; attachmentList.style.display = 'none'; }
    postAuthorNameEl.textContent = profileData().displayName || auth.currentUser.displayName || auth.currentUser.email || 'You';
    modal.style.display = 'flex';
    (postHeadingEl || postContentEl).focus();
    const submitBtn = document.getElementById('submitPostBtn');
    if (!isProfileComplete()) {
        if (profileIncompleteMsg) profileIncompleteMsg.style.display = 'block';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = .6; }
    } else if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = 1; }
}

function closeModal() { modal.style.display = 'none'; }

function renderLoading() { if (!postsContainer) return; postsContainer.innerHTML = `<div style="padding:32px;text-align:center;color:#555;">Loading posts...</div>`; }

function escapeHtml(str) { return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c])); }
function capFirst(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1); }

function renderPosts(snapshot) {
    if (!postsContainer) return;
    if (snapshot.empty) { postsContainer.innerHTML = `<div style="padding:40px;text-align:center;color:#666;">No posts yet. Be the first to share something! ✨</div>`; return; }
    const items = [];
    snapshot.forEach(docRef => {
        const d = docRef.data();
        const ts = d.time || d.createdAt; // backward compatibility
        const time = ts?.toDate ? ts.toDate().toLocaleString() : '';
        const name = d.name || d.authorName || 'Unknown';
        const dept = d.dept || d.department;
        const media = d.media || d.attachments || [];
        const metaParts = [];
        if (d.role) metaParts.push(capFirst(d.role));
        if (dept) metaParts.push(String(dept).toUpperCase());
        if (d.institution) metaParts.push(d.institution);
        const combinedLine = metaParts.length
            ? `${escapeHtml(name)} <span style=\"font-weight:500;color:#475569;\">| ${escapeHtml(metaParts.join(', '))}</span>`
            : escapeHtml(name);
        items.push(`
      <article class=\"post-item\" style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 2px 6px rgba(0,0,0,.04);\">
        <header style=\"display:flex;align-items:center;gap:10px;margin-bottom:8px;\">
          <div style=\"width:38px;height:38px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;\">${(name || 'U').charAt(0).toUpperCase()}</div>
          <div style=\"flex:1;\">
            <div style=\"font-weight:600;line-height:1.2;\">${combinedLine}</div>
            <div style=\"font-size:12px;color:#666;margin-top:2px;\">${time}</div>
          </div>
        </header>
        ${d.heading ? `<h4 style=\"margin:4px 0 10px;font-size:16px;line-height:1.3;color:#1e293b;\">${escapeHtml(d.heading)}</h4>` : ''}
        <div style=\"white-space:pre-wrap;line-height:1.4;font-size:14px;\">${escapeHtml(d.post || d.content || '')}</div>
        ${(media.length) ? `<div style=\\"margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;\\">${media.map(a => `<span style='background:#f1f5f9;border:1px solid #e2e8f0;padding:4px 8px;border-radius:14px;font-size:11px;color:#475569;'>${escapeHtml(a.name)}</span>`).join('')}</div>` : ''}
      </article>`);
    });
    postsContainer.innerHTML = items.join('\n');
}

async function submitPost() {
    if (!auth.currentUser) return;
    if (!isProfileComplete()) {
        postErr.textContent = 'Complete your profile first.'; postErr.style.display = 'block'; return;
    }
    const heading = (postHeadingEl?.value || '').trim();
    const content = postContentEl.value.trim();
    if (!heading) { postErr.textContent = 'Heading is required.'; postErr.style.display = 'block'; return; }
    if (!content) { postErr.textContent = 'Main post content is required.'; postErr.style.display = 'block'; return; }
    postErr.style.display = 'none';
    try {
        const user = auth.currentUser; const p = profileData(); const att = [];
        Array.from(imagesInput?.files || []).forEach(f => att.push({ type: 'image', name: f.name, size: f.size }));
        Array.from(videosInput?.files || []).forEach(f => att.push({ type: 'video', name: f.name, size: f.size }));
        const displayName = p.displayName || user.displayName || user.email || 'User';
        const dept = p.department || null;
        const doc = {
            time: serverTimestamp(),
            authorId: user.uid,
            name: displayName,
            role: p.role || null,
            dept,
            institution: p.institution || null,
            heading,
            post: content,
            media: att
        };
        await addDoc(postsCol, doc);
        closeModal();
    } catch (e) {
        console.error('[Posts] Failed to add post', e);
        let msg = 'Failed to publish. Try again.';
        if (e && (e.code || e.message)) {
            // Expose limited detail for debugging; can be simplified later
            msg += ` (${e.code || e.message})`;
        }
        postErr.textContent = msg;
        postErr.style.display = 'block';
    }
}

function attachListeners() {
    ['#newPostBtn', '#newPostBtn2'].forEach(sel => { const btn = document.querySelector(sel); if (btn) btn.addEventListener('click', e => { if (!auth.currentUser) return; openModal(); }); });
    document.getElementById('cancelPostBtn')?.addEventListener('click', e => { e.preventDefault(); closeModal(); });
    document.getElementById('submitPostBtn')?.addEventListener('click', e => { e.preventDefault(); submitPost(); });
    const refreshAttachmentList = () => {
        if (!attachmentList) return; const items = [];
        if (imagesInput?.files?.length) { Array.from(imagesInput.files).forEach(f => items.push(`<div>🖼️ ${escapeHtml(f.name)} <span style='color:#64748b;font-size:11px;'>(${Math.round(f.size / 1024)} KB)</span></div>`)); }
        if (videosInput?.files?.length) { Array.from(videosInput.files).forEach(f => items.push(`<div>🎬 ${escapeHtml(f.name)} <span style='color:#64748b;font-size:11px;'>(${Math.round(f.size / 1024)} KB)</span></div>`)); }
        if (!items.length) { attachmentList.style.display = 'none'; attachmentList.innerHTML = ''; return; }
        attachmentList.innerHTML = items.join(''); attachmentList.style.display = 'block';
    };
    document.getElementById('addPhotoBtn')?.addEventListener('click', e => { e.preventDefault(); imagesInput?.click(); });
    document.getElementById('addVideoBtn')?.addEventListener('click', e => { e.preventDefault(); videosInput?.click(); });
    imagesInput?.addEventListener('change', refreshAttachmentList);
    videosInput?.addEventListener('change', refreshAttachmentList);
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.style.display === 'flex') closeModal(); });
    modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
}

let fallbackTried = false;
function subscribePosts() {
    renderLoading();
    const primaryQuery = query(postsCol, orderBy('time', 'desc'));
    onSnapshot(primaryQuery, snap => {
        console.log('[Posts] primary time query size=', snap.size);
        if (snap.empty && !fallbackTried) {
            fallbackTried = true;
            console.log('[Posts] No docs with time field yet, retrying with createdAt');
            const legacyQuery = query(postsCol, orderBy('createdAt', 'desc'));
            onSnapshot(legacyQuery, renderPosts, err => {
                console.error('[Posts] Legacy snapshot error', err);
                postsContainer.innerHTML = `<div style=\"padding:40px;text-align:center;color:#c00;\">Failed to load posts.</div>`;
            });
            return;
        }
        renderPosts(snap);
    }, err => {
        console.error('[Posts] Snapshot error (time query)', err);
        postsContainer.innerHTML = `<div style=\"padding:40px;text-align:center;color:#c00;\">Failed to load posts.</div>`;
    });
}

if (document.readyState !== 'loading') { attachListeners(); subscribePosts(); } else { document.addEventListener('DOMContentLoaded', () => { attachListeners(); subscribePosts(); }); }

window.postsModule = { submitPost };

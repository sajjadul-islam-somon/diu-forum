// Firestore post handling for blog page
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
const postErr = document.getElementById('postError');
const postAuthorNameEl = document.getElementById('postAuthorName');

function openModal() {
  if (!auth.currentUser) return; // gating already triggers sign-in
  postErr.style.display = 'none';
  postContentEl.value = '';
  postAuthorNameEl.textContent = auth.currentUser.displayName || auth.currentUser.email || 'You';
  modal.style.display = 'flex';
  postContentEl.focus();
}

function closeModal() { modal.style.display = 'none'; }

function renderLoading() {
  if (!postsContainer) return;
  postsContainer.innerHTML = `<div style="padding:32px;text-align:center;color:#555;">Loading posts...</div>`;
}

function renderPosts(snapshot) {
  if (!postsContainer) return;
  if (snapshot.empty) {
    postsContainer.innerHTML = `<div style="padding:40px;text-align:center;color:#666;">No posts yet. Be the first to share something! ✨</div>`;
    return;
  }
  const items = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    const time = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : '';
    items.push(`
      <article class="post-item" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 2px 6px rgba(0,0,0,.04);">
        <header style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:38px;height:38px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;">
            ${(d.authorName||'U').charAt(0).toUpperCase()}
          </div>
          <div style="flex:1;">
            <div style="font-weight:600;">${escapeHtml(d.authorName || 'Unknown')}</div>
            <div style="font-size:12px;color:#666;">${time}</div>
          </div>
        </header>
        <div style="white-space:pre-wrap;line-height:1.4;font-size:14px;">${escapeHtml(d.content || '')}</div>
      </article>
    `);
  });
  postsContainer.innerHTML = items.join('\n');
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

async function submitPost() {
  if (!auth.currentUser) return;
  const content = postContentEl.value.trim();
  if (!content) {
    postErr.textContent = 'Post content is required.';
    postErr.style.display = 'block';
    return;
  }
  postErr.style.display = 'none';
  try {
    const user = auth.currentUser;
    await addDoc(postsCol, {
      content,
      authorId: user.uid,
      authorName: user.displayName || user.email || 'User',
      createdAt: serverTimestamp()
    });
    closeModal();
  } catch (e) {
    console.error('[Posts] Failed to add post', e);
    postErr.textContent = 'Failed to publish. Try again.';
    postErr.style.display = 'block';
  }
}

function attachListeners() {
  ['#newPostBtn', '#newPostBtn2'].forEach(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.addEventListener('click', (e) => {
      if (!auth.currentUser) return; // auth layer will handle sign-in
      openModal();
    });
  });
  document.getElementById('cancelPostBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });
  document.getElementById('submitPostBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); submitPost(); });
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && modal.style.display==='flex') closeModal(); });
  modal?.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });
}

function subscribePosts() {
  renderLoading();
  const q = query(postsCol, orderBy('createdAt', 'desc'));
  onSnapshot(q, renderPosts, (err)=>{
    console.error('[Posts] Snapshot error', err);
    postsContainer.innerHTML = `<div style="padding:40px;text-align:center;color:#c00;">Failed to load posts.</div>`;
  });
}

if (document.readyState !== 'loading') {
  attachListeners();
  subscribePosts();
} else {
  document.addEventListener('DOMContentLoaded', () => { attachListeners(); subscribePosts(); });
}

window.postsModule = { submitPost };

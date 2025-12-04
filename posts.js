// Replace Firestore usage with Supabase client (window.supabaseClient)

const supabase = window.supabaseClient;
if (!supabase) console.warn('[Posts] supabase client not found. Include UMD + config.js in <head>.');

const postsContainer = document.getElementById('postsContainer');
const postTemplate = document.getElementById('postTemplate');
const commentsTemplate = document.getElementById('commentsTemplate');
const modal = document.getElementById('postModal');
const postContentEl = document.getElementById('postContent');
const postHeadingEl = document.getElementById('postHeading');
const imagesInput = document.getElementById('postImages');
const videosInput = document.getElementById('postVideos');
const attachmentList = document.getElementById('attachmentList');
const profileIncompleteMsg = document.getElementById('profileIncompleteMsg');
const postErr = document.getElementById('postError');
const postAuthorNameEl = document.getElementById('postAuthorName');
const contactEmailEl = document.getElementById('contactEmail');
const contactOtherEl = document.getElementById('contactOther');
const contactModal = document.getElementById('contactModal');
const contactDetailsEl = document.getElementById('contactDetails');

function profileData() {
    try {
        // read legacy `user_profile` (older code) and new `diuProfile` (settings.html)
        const a = JSON.parse(localStorage.getItem('user_profile') || 'null');
        const b = JSON.parse(localStorage.getItem('diuProfile') || 'null');
        const stored = Object.assign({}, b || {}, a || {});
        // normalize common keys
        if (!stored.displayName && stored.display_name) stored.displayName = stored.display_name;
        return stored || {};
    } catch (_) { return {}; }
}

function isProfileComplete() {
    const p = profileData();
    return !!(p.displayName && p.department && p.role);
}

// Submit post using Supabase
async function submitPostHandler(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    postErr.textContent = '';
    if (!isProfileComplete()) {
        profileIncompleteMsg.style.display = 'block';
        return;
    }
    const heading = postHeadingEl.value.trim();
    const content = postContentEl.value.trim();
    if (!content && !heading) {
        postErr.textContent = 'Post content is empty.';
        return;
    }

    try {
        const s = await supabase.auth.getSession();
        const user = s?.data?.session?.user ?? null;
        const p = profileData();
        const media = [];
        Array.from(imagesInput?.files || []).forEach(f => media.push({ type: 'image', name: f.name, size: f.size }));
        Array.from(videosInput?.files || []).forEach(f => media.push({ type: 'video', name: f.name, size: f.size }));

        // Insert using columns that exist in the DB schema: title, body, metadata
        const row = {
            title: heading || null,
            body: content || null,
            metadata: {
                media,
                author_name: p.displayName || user?.user_metadata?.full_name || null,
                author_photo: user?.user_metadata?.avatar_url || null,
                role: p.role || null,
                department: p.department || null,
                institution: p.institution || null,
                contacts: {
                    email: contactEmailEl?.value || user?.email || null,
                    other: contactOtherEl?.value || null
                }
            }
        };

        const { data, error } = await supabase.from('posts').insert([row]).select().single();
        if (error) throw error;
        // close modal, hide warnings and refresh list
        if (modal) modal.style.display = 'none';
        if (profileIncompleteMsg) profileIncompleteMsg.style.display = 'none';
        if (postErr) { postErr.style.display = 'none'; postErr.textContent = ''; }
        // clear inputs
        if (postHeadingEl) postHeadingEl.value = '';
        if (postContentEl) postContentEl.value = '';
        if (imagesInput) imagesInput.value = '';
        if (videosInput) videosInput.value = '';
        if (contactOtherEl) contactOtherEl.value = '';
        // refresh list to reflect DB defaults and triggers
        await loadPosts();
    } catch (err) {
        console.error('[Posts] submit error', err);
        if (postErr) { postErr.style.display = 'block'; postErr.textContent = (err?.message || String(err)) || 'Failed to create post'; }
    }
}

// Hook the existing form submit listener (if present)
const postForm = document.getElementById('postForm');
if (postForm) postForm.addEventListener('submit', submitPostHandler);

// Wire create-post UI: open modal, cancel, and submit
function wireCreatePostUI() {
    const newPostBtn = document.getElementById('newPostBtn');
    const newPostBtn2 = document.getElementById('newPostBtn2');
    const cancelBtn = document.getElementById('cancelPostBtn');
    const submitBtn = document.getElementById('submitPostBtn');

    async function openModal() {
        try {
            const s = await supabase.auth.getSession();
            const user = s?.data?.session?.user ?? null;
            if (!user) { await window.signInWithGoogle?.(); return; }
            // prefill author name and contact email
            const p = profileData();
            postAuthorNameEl && (postAuthorNameEl.textContent = p.displayName || user.user_metadata?.full_name || user.email || 'You');
            contactEmailEl && (contactEmailEl.value = p.email || user.email || '');
            profileIncompleteMsg && (profileIncompleteMsg.style.display = isProfileComplete() ? 'none' : 'block');
            if (modal) modal.style.display = 'flex';
        } catch (err) { console.warn('[Posts] openModal', err); }
    }

    if (newPostBtn) newPostBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    if (newPostBtn2) newPostBtn2.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); if (modal) modal.style.display = 'none'; });
    if (submitBtn) submitBtn.addEventListener('click', submitPostHandler);
}

// Realtime subscription (optional) - listens to new posts
// Load and render posts
async function loadPosts() {
    if (!postsContainer || !postTemplate) return;
    postsContainer.innerHTML = '';
    try {
        const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        (data || []).forEach(renderPost);
    } catch (e) {
        console.error('[Posts] loadPosts', e);
        postsContainer.innerHTML = '<div class="error">Failed to load posts.</div>';
    }
}

function renderPost(post) {
    if (!postTemplate) return;
    const tpl = postTemplate.content.cloneNode(true);
    const article = tpl.querySelector('article');
    article.setAttribute('data-post-id', post.id);
    const authorName = article.querySelector('[data-author-name]');
    const postTime = article.querySelector('[data-post-time]');
    const postHeading = article.querySelector('[data-post-heading]');
    const postContent = article.querySelector('[data-post-content]');
    const attachments = article.querySelector('[data-post-attachments]');
    const contacts = article.querySelector('[data-post-contacts]');

    const meta = post.metadata || {};
    if (authorName) authorName.textContent = meta.author_name || post.author_name || 'User';
    const timeVal = post.created_at || post.posted_at || post.updated_at;
    if (postTime) postTime.textContent = timeVal ? new Date(timeVal).toLocaleString() : '';
    if (postHeading) {
        if (post.title) { postHeading.textContent = post.title; postHeading.style.display = ''; }
        else postHeading.style.display = 'none';
    }
    if (postContent) postContent.textContent = post.body || '';
    if (attachments) {
        if (Array.isArray(meta.media) && meta.media.length) {
            attachments.style.display = '';
            attachments.textContent = (meta.media || []).map(m => m.name || m.type).join(', ');
        } else attachments.style.display = 'none';
    }
    if (contacts) {
        if (meta.contacts) {
            contacts.style.display = '';
            contacts.textContent = meta.contacts.email || '';
        } else contacts.style.display = 'none';
    }

    // Wire actions: like, comment, share
    const likeBtn = article.querySelector('[data-like-btn]');
    const likeCountEl = article.querySelector('[data-like-count]');
    const commentBtn = article.querySelector('[data-comment-btn]');
    const commentCountEl = article.querySelector('[data-comment-count]');
    const shareBtn = article.querySelector('[data-share-btn]');

    // Set initial counts
    setLikeCount(post.id, likeCountEl);
    setCommentCount(post.id, commentCountEl);

        if (likeBtn) likeBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await toggleLike(post.id, likeCountEl, likeBtn);
        });
    if (commentBtn) commentBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleCommentsPanel(article, post.id);
    });
    if (shareBtn) shareBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sharePost(post.id);
    });

    postsContainer.appendChild(tpl);
}

async function setLikeCount(postId, el) {
    try {
        const res = await supabase.from('post_likes').select('id', { count: 'exact' }).eq('post_id', postId);
        if (res.error) throw res.error;
        // prefer count returned by supabase, otherwise fallback to data length
        const count = (typeof res.count === 'number') ? res.count : (Array.isArray(res.data) ? res.data.length : 0);
        if (el) el.textContent = count;
        console.debug('[Posts] setLikeCount', { postId, count });
        return count;
    } catch (e) { console.warn('[Posts] setLikeCount', e); return null; }
}

// Ensure a `profiles` row exists for the logged-in auth user and return its id.
async function ensureProfileForAuth(user) {
    if (!user) return null;
    try {
        // Try find existing profile by auth_id
        let { data, error } = await supabase.from('profiles').select('id').eq('auth_id', user.id).limit(1).maybeSingle();
        if (error) {
            console.warn('[Posts] ensureProfileForAuth: select error', error);
        }
        if (data && data.id) return data.id;

        // Fallback: try find by email
        if (user.email) {
            const byEmail = await supabase.from('profiles').select('id').eq('email', user.email).limit(1).maybeSingle();
            if (byEmail.data && byEmail.data.id) {
                // update auth_id for that profile
                await supabase.from('profiles').update({ auth_id: user.id }).eq('id', byEmail.data.id);
                return byEmail.data.id;
            }
        }

        // Create new profile row
        const insertPayload = {
            auth_id: user.id,
            email: user.email || null,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null
        };
        const ins = await supabase.from('profiles').insert([insertPayload]).select('id').single();
        if (ins.error) {
            console.warn('[Posts] ensureProfileForAuth: insert error', ins.error);
            return null;
        }
        return ins.data?.id ?? null;
    } catch (e) {
        console.warn('[Posts] ensureProfileForAuth', e);
        return null;
    }
}

async function setCommentCount(postId, el) {
    try {
        const { data, error } = await supabase.from('comments').select('id', { count: 'exact' }).eq('post_id', postId);
        if (error) throw error;
        const count = data?.length ?? 0;
        if (el) el.textContent = count;
    } catch (e) { console.warn('[Posts] setCommentCount', e); }
}

async function toggleLike(postId, countEl, likeBtn) {
    try {
        const s = await supabase.auth.getSession();
        const user = s?.data?.session?.user ?? null;
        if (!user) { await window.signInWithGoogle?.(); return; }
        // Ensure we have a profiles.id to use for the FK
        const profileId = await ensureProfileForAuth(user);
        if (!profileId) { throw new Error('Unable to resolve user profile for likes'); }

        // Check if liked (by profiles.id)
        const existingQ = await supabase.from('post_likes').select('*').eq('post_id', postId).eq('user_id', profileId).limit(1).maybeSingle();
        const existing = existingQ?.data ?? null;
        // optimistic UI: toggle liked class and adjust count immediately
        try {
            if (likeBtn) likeBtn.classList.toggle('liked', !(existing && existing.id));
            // compute optimistic count
            const cur = parseInt(countEl?.textContent || '0', 10) || 0;
            if (existing && existing.id) {
                if (countEl) countEl.textContent = Math.max(cur - 1, 0);
            } else {
                if (countEl) countEl.textContent = (cur + 1).toString();
            }
        } catch (_) {}

        if (existing && existing.id) {
            // remove
            const del = await supabase.from('post_likes').delete().eq('id', existing.id);
            if (del.error) throw del.error;
        } else {
            const ins = await supabase.from('post_likes').insert([{ post_id: postId, user_id: profileId, created_at: new Date().toISOString() }]);
            if (ins.error) throw ins.error;
        }

        // reconcile authoritative count from server
        await setLikeCount(postId, countEl);
    } catch (e) {
        console.error('[Posts] toggleLike', e);
    }
}

function toggleCommentsPanel(articleEl, postId) {
    try {
        let panel = articleEl.querySelector('[data-comments-panel]');
        if (!panel) {
            if (!commentsTemplate) return;
            const tpl = commentsTemplate.content.cloneNode(true);
            panel = tpl.querySelector('[data-comments-panel]');
            articleEl.appendChild(panel);
            wireCommentsPanel(panel, postId);
        }
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    } catch (e) { console.warn('[Posts] toggleCommentsPanel', e); }
}

function wireCommentsPanel(panel, postId) {
    const list = panel.querySelector('[data-comments-list]');
    const form = panel.querySelector('[data-comments-form]');
    if (!form) return;
    loadComments(postId, list);
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input[name="content"]');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        try {
            const s = await supabase.auth.getSession();
            const user = s?.data?.session?.user ?? null;
            if (!user) { await window.signInWithGoogle?.(); return; }
            const payload = {
                post_id: postId,
                author_id: null,
                content: text,
                metadata: {
                    author_auth_id: user.id,
                    author_name: user.user_metadata?.full_name || user.email
                },
                created_at: new Date().toISOString()
            };
            const { error } = await supabase.from('comments').insert([payload]);
            if (error) throw error;
            input.value = '';
            // comment count will be updated by realtime subscription
        } catch (err) { console.error('[Posts] submit comment', err); }
    });
}

async function loadComments(postId, listEl) {
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading">Loading comments...</div>';
    try {
        const { data, error } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
        if (error) throw error;
        listEl.innerHTML = '';
        (data || []).forEach(c => {
            const div = document.createElement('div');
            div.className = 'comment-item';
            const author = (c.metadata && c.metadata.author_name) || c.author_name || 'User';
            const time = c.created_at ? new Date(c.created_at).toLocaleString() : '';
            div.innerHTML = `<strong>${escapeHtml(author)}</strong> <small>${escapeHtml(time)}</small><div>${escapeHtml(c.content)}</div>`;
            listEl.appendChild(div);
        });
    } catch (e) { console.warn('[Posts] loadComments', e); listEl.innerHTML = '<div class="error">Failed to load comments</div>'; }
}

function sharePost(postId) {
    const url = `${window.location.origin}${window.location.pathname}#post-${postId}`;
    if (navigator.share) {
        navigator.share({ title: 'DIU Forum Post', url }).catch(()=>{});
    } else {
        navigator.clipboard?.writeText(url).then(()=> alert('Post link copied to clipboard')); 
    }
}

// Realtime subscriptions: likes and comments
if (supabase && supabase.channel) {
    try {
        const ch = supabase.channel('public:posts_live');
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_likes' }, payload => {
            // update like count if the post is in DOM
            const postId = payload.new.post_id;
            const el = document.querySelector(`[data-post-id="${postId}"] [data-like-count]`);
            if (el) setLikeCount(postId, el);
        });
        ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'post_likes' }, payload => {
            const postId = payload.old.post_id;
            const el = document.querySelector(`[data-post-id="${postId}"] [data-like-count]`);
            if (el) setLikeCount(postId, el);
        });
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, payload => {
            const postId = payload.new.post_id;
            const countEl = document.querySelector(`[data-post-id="${postId}"] [data-comment-count]`);
            if (countEl) setCommentCount(postId, countEl);
            const panelList = document.querySelector(`[data-post-id="${postId}"] [data-comments-list]`);
            if (panelList) loadComments(postId, panelList);
        });
        ch.subscribe();
    } catch (e) { console.warn('[Posts] realtime likes/comments failed', e); }
}

// Initial load
loadPosts();
wireCreatePostUI();

import { getCachedProfile, fetchProfile, ensureProfileRow, onProfileCacheUpdate } from './profileStore.js';

// Replace Firestore usage with Supabase client (window.supabaseClient)

const supabase = window.supabaseClient;
const authorProfileCache = new Map(); // profileId -> { name, role, department, institution, avatar }

async function getProfileByIdCached(profileId) {
    try {
        if (!profileId || !supabase) return null;
        if (authorProfileCache.has(profileId)) return authorProfileCache.get(profileId);
        const { data, error } = await supabase
            .from('profiles')
            .select('full_name, display_name, role, department, institution, avatar_url, photo_url')
            .eq('id', profileId)
            .limit(1)
            .maybeSingle();
        if (error) return null;
        const resolved = {
            name: data?.full_name || data?.display_name || null,
            role: data?.role || '',
            department: data?.department || '',
            institution: data?.institution || '',
            avatar: data?.avatar_url || data?.photo_url || null
        };
        authorProfileCache.set(profileId, resolved);
        return resolved;
    } catch (_) { return null; }
}
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
const postModalTitleEl = document.getElementById('postModalTitle');
const submitPostBtnEl = document.getElementById('submitPostBtn');
const closeContactBtn = document.getElementById('closeContactBtn');
const sidebarAvatarImg = document.getElementById('userAvatarImg');
const sidebarAvatarLetter = document.getElementById('userAvatarLetter');
const sidebarNameEl = document.getElementById('profileName');
const sidebarRoleEl = document.getElementById('profileType');
const sidebarDeptEl = document.getElementById('profileDepartment');
const createPostAvatarEl = document.getElementById('createPostAvatar');

let cachedProfile = getCachedProfile();
let remoteProfileLoaded = !!(cachedProfile && cachedProfile.authId);
let editingPostId = null;
let editingPostData = null;
const postCache = new Map();
const commentCache = new Map();
let currentAuthUserId = cachedProfile?.authId || null;
let currentProfileIdCache = cachedProfile?.id || null;

(function mergeLegacyProfile() {
    try {
        const legacy = JSON.parse(localStorage.getItem('user_profile') || 'null');
        if (legacy && typeof legacy === 'object') {
            cachedProfile = { ...legacy, ...cachedProfile };
        }
    } catch (_) { }
})();

onProfileCacheUpdate(profile => {
    cachedProfile = profile || {};
    if (cachedProfile && cachedProfile.authId) remoteProfileLoaded = true;
    if (cachedProfile?.authId) currentAuthUserId = cachedProfile.authId;
    if (cachedProfile?.id) currentProfileIdCache = cachedProfile.id;
    hydrateProfileCard();
});

if (closeContactBtn) {
    closeContactBtn.addEventListener('click', (e) => {
        e.preventDefault();
        hideContactModal();
    });
}

if (contactModal) {
    contactModal.addEventListener('click', (e) => {
        if (e.target === contactModal) hideContactModal();
    });
}

function profileData() {
    return cachedProfile || {};
}

async function syncProfileFromSupabase(force = false) {
    try {
        const session = await supabase.auth.getSession();
        const user = session?.data?.session?.user ?? null;
        if (!user) return;
        if (remoteProfileLoaded && !force) return;
        const profile = await fetchProfile(user, { createIfMissing: true });
        if (profile) {
            cachedProfile = profile;
            remoteProfileLoaded = true;
            if (profile.authId) currentAuthUserId = profile.authId;
            if (profile.id) currentProfileIdCache = profile.id;
            hydrateProfileCard();
        }
    } catch (err) {
        console.warn('[Posts] syncProfileFromSupabase failed', err);
    }
}

function isProfileComplete() {
    const p = profileData();
    return !!(p.displayName && p.department && p.role);
}

async function hydrateProfileCard() {
    try {
        const localProfile = profileData();
        const session = await supabase.auth.getSession();
        const user = session?.data?.session?.user ?? null;

        const displayName = localProfile.displayName || localProfile.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'User';
        const roleText = localProfile.role || user?.user_metadata?.role || 'Member';
        const deptText = localProfile.department || localProfile.institution || user?.user_metadata?.department || 'DIU';
        const avatarUrl = localProfile.photoURL || localProfile.photo_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

        if (sidebarNameEl) sidebarNameEl.textContent = displayName;
        if (sidebarRoleEl) sidebarRoleEl.textContent = roleText;
        if (sidebarDeptEl) sidebarDeptEl.textContent = deptText;

        const fallbackLetter = (displayName?.trim?.() || 'U').charAt(0).toUpperCase();
        if (sidebarAvatarLetter) sidebarAvatarLetter.textContent = fallbackLetter;

        if (sidebarAvatarImg) {
            if (avatarUrl) {
                sidebarAvatarImg.src = avatarUrl;
                sidebarAvatarImg.style.display = 'block';
                if (sidebarAvatarLetter) sidebarAvatarLetter.style.display = 'none';
            } else {
                sidebarAvatarImg.removeAttribute('src');
                sidebarAvatarImg.style.display = 'none';
                if (sidebarAvatarLetter) sidebarAvatarLetter.style.display = 'flex';
            }
        }

        if (createPostAvatarEl) createPostAvatarEl.textContent = fallbackLetter;
    } catch (err) {
        console.warn('[Posts] hydrateProfileCard failed', err);
    }
}

// Submit post using Supabase
async function submitPostHandler(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    postErr.textContent = '';
    const isEditing = !!editingPostId;
    if (!isEditing && !isProfileComplete()) {
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
        const user = await requireAuthUser();
        if (!user) return;
        const profileRow = await ensureProfileRow(user);
        const p = profileData();
        const profileId = profileRow?.id || p.id || null;
        const uploadedMedia = [];
        Array.from(imagesInput?.files || []).forEach(f => uploadedMedia.push({ type: 'image', name: f.name, size: f.size }));
        Array.from(videosInput?.files || []).forEach(f => uploadedMedia.push({ type: 'video', name: f.name, size: f.size }));
        const existingMeta = editingPostData?.metadata || {};
        const typedEmail = safeTrim(contactEmailEl?.value);
        const otherContact = safeTrim(contactOtherEl?.value);
        const metadata = {
            ...existingMeta,
            media: isEditing ? (existingMeta.media || []) : uploadedMedia,
            author_name: p.displayName || user?.user_metadata?.full_name || user?.email || existingMeta.author_name || null,
            author_photo: user?.user_metadata?.avatar_url || user?.user_metadata?.picture || existingMeta.author_photo || null,
            role: p.role || existingMeta.role || null,
            department: p.department || existingMeta.department || null,
            institution: p.institution || existingMeta.institution || null,
            author_auth_id: user.id,
            author_profile_id: profileId || existingMeta.author_profile_id || null,
            contacts: {
                ...existingMeta.contacts,
                email: typedEmail || p.primaryEmail || user.email || null,
                other: otherContact || null
            }
        };

        // Insert using columns that exist in the DB schema: title, body, metadata
        const row = {
            title: heading || null,
            body: content || null,
            metadata: metadata
        };
        if (!isEditing && profileId) row.author_id = profileId;

        let error;
        if (isEditing && editingPostId) {
            const { error: updError } = await supabase.from('posts').update(row).eq('id', editingPostId);
            error = updError;
        } else {
            const { error: insError } = await supabase.from('posts').insert([row]);
            error = insError;
        }
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
        editingPostId = null;
        editingPostData = null;
        // refresh list to reflect DB defaults and triggers
        await loadPosts();
    } catch (err) {
        console.error('[Posts] submit error', err);
        if (postErr) { postErr.style.display = 'block'; postErr.textContent = (err?.message || String(err)) || 'Failed to save post'; }
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

    if (newPostBtn) newPostBtn.addEventListener('click', (e) => { e.preventDefault(); openPostModal({ mode: 'create' }); });
    if (newPostBtn2) newPostBtn2.addEventListener('click', (e) => { e.preventDefault(); openPostModal({ mode: 'create' }); });
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closePostModal(); });
    if (submitBtn) submitBtn.addEventListener('click', submitPostHandler);
}

async function openPostModal({ mode = 'create', post } = {}) {
    try {
        const user = await requireAuthUser();
        if (!user) return;
        const profile = profileData();
        const displayName = profile.displayName || user.user_metadata?.full_name || user.email || 'You';
        const fallbackEmail = profile.primaryEmail || profile.email || user.email || '';
        if (postAuthorNameEl) postAuthorNameEl.textContent = displayName;
        if (imagesInput) imagesInput.value = '';
        if (videosInput) videosInput.value = '';

        if (mode === 'edit' && post) {
            editingPostId = post.id;
            editingPostData = post;
            if (postModalTitleEl) postModalTitleEl.textContent = 'Edit Post';
            if (submitPostBtnEl) submitPostBtnEl.textContent = 'Save Changes';
            if (postHeadingEl) postHeadingEl.value = post.title || '';
            if (postContentEl) postContentEl.value = post.body || '';
            const metaContacts = post?.metadata?.contacts || {};
            if (contactEmailEl) contactEmailEl.value = metaContacts.email || fallbackEmail;
            if (contactOtherEl) contactOtherEl.value = metaContacts.other || '';
            if (profileIncompleteMsg) profileIncompleteMsg.style.display = 'none';
        } else {
            editingPostId = null;
            editingPostData = null;
            if (postModalTitleEl) postModalTitleEl.textContent = 'Create Post';
            if (submitPostBtnEl) submitPostBtnEl.textContent = 'Post';
            if (postHeadingEl) postHeadingEl.value = '';
            if (postContentEl) postContentEl.value = '';
            if (contactOtherEl) contactOtherEl.value = '';
            if (contactEmailEl) contactEmailEl.value = fallbackEmail;
            if (profileIncompleteMsg) profileIncompleteMsg.style.display = isProfileComplete() ? 'none' : 'block';
        }

        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.warn('[Posts] openPostModal failed', err);
    }
}

function closePostModal() {
    if (modal) modal.style.display = 'none';
    editingPostId = null;
    editingPostData = null;
    if (profileIncompleteMsg) profileIncompleteMsg.style.display = 'none';
}

async function requireAuthUser() {
    const session = await supabase.auth.getSession();
    const user = session?.data?.session?.user ?? null;
    if (!user) {
        await window.signInWithGoogle?.();
        return null;
    }
    currentAuthUserId = user.id;
    return user;
}

// Realtime subscription (optional) - listens to new posts
// Load and render posts
async function loadPosts() {
    if (!postsContainer || !postTemplate) return;
    postsContainer.innerHTML = '';
    try {
        const session = await supabase.auth.getSession();
        const currentUser = session?.data?.session?.user ?? null;
        const context = {
            currentUserId: currentUser?.id || null,
            currentProfileId: profileData()?.id || null
        };
        if (context.currentUserId) currentAuthUserId = context.currentUserId;
        if (context.currentProfileId) currentProfileIdCache = context.currentProfileId;
        const { data, error } = await supabase.from('posts_with_profiles').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        postCache.clear();
        for (const post of (data || [])) {
            postCache.set(post.id, post);
            await renderPost(post, context);
        }
    } catch (e) {
        console.error('[Posts] loadPosts', e);
        postsContainer.innerHTML = '<div class="error">Failed to load posts.</div>';
    }
}

async function renderPost(post, context = {}) {
    if (!postTemplate) return;
    const tpl = postTemplate.content.cloneNode(true);
    const article = tpl.querySelector('article');
    article.setAttribute('data-post-id', post.id);
    if (article && post?.id) {
        article.id = `post-${post.id}`;
    }
    const authorName = article.querySelector('[data-author-name]');
    const authorMetaEl = article.querySelector('[data-author-meta]');
    const authorAvatarEl = article.querySelector('[data-author-avatar]');
    const authorAvatarImg = article.querySelector('[data-author-avatar-img]');
    const authorAvatarLetter = article.querySelector('[data-author-avatar] .author-avatar-letter');
    const postTime = article.querySelector('[data-post-time]');
    const postHeading = article.querySelector('[data-post-heading]');
    const postContent = article.querySelector('[data-post-content]');
    const attachments = article.querySelector('[data-post-attachments]');
    const contacts = article.querySelector('[data-post-contacts]');

    const meta = post.metadata || {};
    let authorDisplayName = (post.author_display_name || post.author_full_name || meta.author_name || post.author_name || '').trim();
    let authorPhoto = post.author_avatar || meta.author_photo || meta.author_avatar || post.author_photo || null;
    let roleLabel = formatRoleLabel(post.author_role || meta.role || meta.author_role);
    let deptLabel = formatDepartmentLabel(post.author_department || post.author_institution || meta.department || meta.author_department);
    const authorProfileId = post?.author_id || meta.author_profile_id || null;
    const looksLikeEmail = (str) => /.+@.+\..+/.test(String(str || ''));
    if (authorProfileId) {
        const resolved = await getProfileByIdCached(authorProfileId);
        if (resolved) {
            if (!authorDisplayName || looksLikeEmail(authorDisplayName)) authorDisplayName = resolved.name || authorDisplayName || 'User';
            if (!roleLabel) roleLabel = formatRoleLabel(resolved.role);
            if (!deptLabel) deptLabel = formatDepartmentLabel(resolved.department || resolved.institution);
            if (!authorPhoto) authorPhoto = resolved.avatar || authorPhoto;
        }
    } else {
        if (!authorDisplayName) authorDisplayName = 'User';
    }
    const contactInfo = {
        email: safeTrim(meta.contacts?.email),
        other: safeTrim(meta.contacts?.other)
    };
    const authorRoleDept = [roleLabel, deptLabel].filter(Boolean).join(' • ');
    if (authorName) authorName.textContent = authorDisplayName;
    if (authorMetaEl) {
        if (authorRoleDept) {
            authorMetaEl.textContent = authorRoleDept;
            authorMetaEl.style.display = 'inline';
        } else {
            authorMetaEl.textContent = '';
            authorMetaEl.style.display = 'none';
        }
    }
    if (authorAvatarEl) {
        setAvatarVisual(authorAvatarEl, {
            imgEl: authorAvatarImg,
            letterEl: authorAvatarLetter,
            url: authorPhoto,
            fallback: authorDisplayName
        });
    }
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
        if (contactInfo.email || contactInfo.other) {
            contacts.style.display = '';
            const parts = [];
            if (contactInfo.email) parts.push(contactInfo.email);
            if (contactInfo.other) parts.push(contactInfo.other);
            contacts.textContent = parts.join('  |  ');
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

    attachPostMenu(article, post, {
        contactInfo,
        authorName: authorDisplayName,
        currentUserId: context.currentUserId,
        currentProfileId: context.currentProfileId
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

async function setCommentCount(postId, el) {
    try {
        const { count, error } = await supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('post_id', postId);
        if (error) throw error;
        const resolved = typeof count === 'number' ? count : 0;
        if (el) el.textContent = resolved;
        return resolved;
    } catch (e) {
        console.warn('[Posts] setCommentCount', e);
        return null;
    }
}

async function toggleLike(postId, countEl, likeBtn) {
    try {
        const s = await supabase.auth.getSession();
        const user = s?.data?.session?.user ?? null;
        if (!user) { await window.signInWithGoogle?.(); return; }
        // Ensure we have a profiles.id to use for the FK
        const profileRow = await ensureProfileRow(user);
        const profileId = profileRow?.id;
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
            wireCommentsPanel(panel, postId, articleEl);
        }
        const shouldOpen = panel.style.display === 'none' || panel.style.display === '';
        if (shouldOpen) {
            closeOtherCommentPanels(panel);
            panel.style.display = 'flex';
            updateCommentComposerAvatar(panel);
            if (typeof panel.__refreshComments === 'function') {
                panel.__refreshComments();
            }
        } else {
            panel.style.display = 'none';
        }
    } catch (e) { console.warn('[Posts] toggleCommentsPanel', e); }
}

function wireCommentsPanel(panel, postId, articleEl) {
    const list = panel.querySelector('[data-comments-list]');
    const form = panel.querySelector('[data-comments-form]');
    const emptyState = panel.querySelector('[data-comments-empty]');
    const countBadge = panel.querySelector('[data-comments-count]');
    if (!form || !list) return;

    panel.dataset.postId = postId;
    const refresh = () => loadComments(postId, list, { emptyState, countEl: countBadge });
    panel.__refreshComments = refresh;
    refresh();
    updateCommentComposerAvatar(panel);

    const textarea = form.querySelector('textarea[name="content"]');
    if (textarea) {
        textarea.addEventListener('input', () => showCommentStatus(panel, ''));
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!textarea) return;
        const text = textarea.value.trim();
        if (!text) {
            showCommentStatus(panel, 'Please write a comment before sending.', true);
            return;
        }
        try {
            showCommentStatus(panel, 'Posting comment...', false);
            if (submitBtn) submitBtn.disabled = true;
            const s = await supabase.auth.getSession();
            const user = s?.data?.session?.user ?? null;
            if (!user) {
                await window.signInWithGoogle?.();
                showCommentStatus(panel, '', false);
                return;
            }
            const profileRow = await ensureProfileRow(user);
            const profile = profileData();
            const authorName = profile.displayName || user.user_metadata?.full_name || user.email;
            const authorRole = profile.role || null;
            const authorDept = profile.department || profile.institution || null;
            const authorAvatar = profile.avatarUrl || user.user_metadata?.avatar_url || null;

            const payload = {
                post_id: postId,
                author_id: profileRow?.id || null,
                content: text,
                metadata: {
                    author_auth_id: user.id,
                    author_name: authorName,
                    author_role: authorRole,
                    author_department: authorDept,
                    author_avatar: authorAvatar
                },
                created_at: new Date().toISOString()
            };
            const { error } = await supabase.from('comments').insert([payload]);
            if (error) throw error;
            textarea.value = '';
            refresh();
            const outerCount = articleEl?.querySelector('[data-comment-count]');
            if (outerCount) setCommentCount(postId, outerCount);
            showCommentStatus(panel, 'Comment posted', false);
        } catch (err) {
            console.error('[Posts] submit comment', err);
            showCommentStatus(panel, err?.message || 'Failed to post comment.', true);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

async function loadComments(postId, listEl, options = {}) {
    if (!listEl) return;
    const { emptyState, countEl } = options;
    listEl.innerHTML = '<div class="comments-loading"><i class="fas fa-spinner fa-spin"></i> Loading comments...</div>';
    try {
        const { data, error, count } = await supabase
            .from('comments_with_profiles')
            .select('*', { count: 'exact' })
            .eq('post_id', postId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        const comments = data || [];
        listEl.innerHTML = '';
        comments.forEach(comment => {
            commentCache.set(comment.id, comment);
            listEl.appendChild(createCommentElement(comment));
        });
        if (emptyState) emptyState.style.display = comments.length ? 'none' : 'flex';
        if (countEl) countEl.textContent = String(typeof count === 'number' ? count : comments.length);
    } catch (e) {
        console.warn('[Posts] loadComments', e);
        listEl.innerHTML = '<div class="comments-error">Failed to load comments.</div>';
        if (emptyState) emptyState.style.display = 'none';
    }
}

function sharePost(postId) {
    const url = getPostPermalink(postId);
    if (navigator.share) {
        navigator.share({ title: 'DIU Forum Post', url }).catch(()=>{});
    } else {
        navigator.clipboard?.writeText(url).then(()=> alert('Post link copied to clipboard')); 
    }
}

function updateCommentComposerAvatar(panel) {
    const badge = panel?.querySelector('[data-comment-avatar]');
    if (!badge) return;
    const imgEl = badge.querySelector('[data-comment-avatar-img]');
    const letterEl = badge.querySelector('.comment-avatar-letter') || badge;
    const source = profileData();
    const avatarUrl = source.avatarUrl || source.photoURL || source.photo_url || '';
    const fallbackName = source.displayName || source.full_name || source.primaryEmail || source.email || 'U';
    setAvatarVisual(badge, { imgEl, letterEl, url: avatarUrl, fallback: fallbackName });
}

function showCommentStatus(panel, message, isError = false) {
    const statusEl = panel?.querySelector('[data-comments-status]');
    if (!statusEl) return;
    if (!message) {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
        statusEl.classList.remove('is-error');
        if (statusEl.__timeout) clearTimeout(statusEl.__timeout);
        return;
    }
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', !!isError);
    statusEl.style.display = 'block';
    if (statusEl.__timeout) clearTimeout(statusEl.__timeout);
    statusEl.__timeout = setTimeout(() => {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
    }, 2600);
}

function createCommentElement(comment) {
    const meta = comment?.metadata || {};
    const wrapper = document.createElement('div');
    wrapper.className = 'comment-item';
    wrapper.dataset.commentId = comment.id;
    if (comment.post_id) wrapper.dataset.postId = comment.post_id;

    const avatar = document.createElement('div');
    avatar.className = 'comment-avatar';
    const resolvedAvatar = comment.author_avatar || meta.author_avatar || null;
    const resolvedName = (comment.author_display_name || comment.author_full_name || meta.author_name || comment.author_name || 'U').trim();
    if (resolvedAvatar) {
        const img = document.createElement('img');
        img.src = resolvedAvatar;
        img.alt = resolvedName || 'Avatar';
        avatar.appendChild(img);
    } else {
        avatar.textContent = commentInitial(resolvedName);
    }
    wrapper.appendChild(avatar);

    const body = document.createElement('div');
    body.className = 'comment-body';

    const metaRow = document.createElement('div');
    metaRow.className = 'comment-meta';

    const nameEl = document.createElement('span');
    nameEl.className = 'comment-author';
    nameEl.textContent = resolvedName || 'Community member';
    metaRow.appendChild(nameEl);

    const roleLabel = buildCommentRoleLabel({
        author_role: comment.author_role || meta.author_role || null,
        author_department: comment.author_department || comment.author_institution || meta.author_department || null
    });
    if (roleLabel) {
        const roleEl = document.createElement('span');
        roleEl.className = 'comment-role';
        roleEl.textContent = roleLabel;
        metaRow.appendChild(roleEl);
    }

    const timeEl = document.createElement('span');
    timeEl.className = 'comment-time';
    timeEl.textContent = formatTimeAgo(comment.created_at);
    metaRow.appendChild(timeEl);

    const headerRow = document.createElement('div');
    headerRow.className = 'comment-header';
    headerRow.appendChild(metaRow);

    if (canModifyComment(comment)) {
        headerRow.appendChild(buildCommentMenu(comment, wrapper));
    }

    body.appendChild(headerRow);

    const contentEl = document.createElement('div');
    contentEl.className = 'comment-content';
    contentEl.textContent = comment.content || '';
    body.appendChild(contentEl);

    wrapper.appendChild(body);
    return wrapper;
}

function buildCommentRoleLabel(meta) {
    const parts = [];
    const role = formatRoleLabel(meta.author_role);
    const dept = formatDepartmentLabel(meta.author_department);
    if (role) parts.push(role);
    if (dept) parts.push(dept);
    return parts.join(' • ');
}

function canModifyComment(comment) {
    const meta = comment?.metadata || {};
    const authorAuthId = meta.author_auth_id || comment?.author_auth_id || null;
    const authorProfileId = comment?.author_id || meta.author_profile_id || null;
    const authId = currentAuthUserId || cachedProfile?.authId || null;
    const profileId = currentProfileIdCache || cachedProfile?.id || profileData()?.id || null;
    return !!(
        (authId && authorAuthId && authId === authorAuthId) ||
        (profileId && authorProfileId && profileId === authorProfileId)
    );
}

function buildCommentMenu(comment, wrapper) {
    const menuWrap = document.createElement('div');
    menuWrap.className = 'comment-menu';

    const toggle = document.createElement('button');
    toggle.className = 'comment-menu-toggle';
    toggle.setAttribute('aria-label', 'Comment actions');
    toggle.innerHTML = '<i class="fas fa-ellipsis-h"></i>';

    const dropdown = document.createElement('div');
    dropdown.className = 'comment-menu-dropdown';

    const editBtn = document.createElement('button');
    editBtn.className = 'comment-menu-item';
    editBtn.innerHTML = '<i class="fas fa-pen"></i><span>Edit</span>';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'comment-menu-item is-destructive';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i><span>Delete</span>';

    dropdown.appendChild(editBtn);
    dropdown.appendChild(deleteBtn);

    menuWrap.appendChild(toggle);
    menuWrap.appendChild(dropdown);

    menuWrap.addEventListener('click', (e) => e.stopPropagation());

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const opening = !dropdown.classList.contains('open');
        closeAllCommentMenus(opening ? dropdown : null);
        dropdown.classList.toggle('open', opening);
        toggle.classList.toggle('is-open', opening);
        if (opening) {
            const outsideHandler = (evt) => {
                if (!menuWrap.contains(evt.target)) {
                    closeCommentMenu(dropdown);
                }
            };
            dropdown.__outsideHandler = outsideHandler;
            document.addEventListener('click', outsideHandler);
        } else if (dropdown.__outsideHandler) {
            document.removeEventListener('click', dropdown.__outsideHandler);
            delete dropdown.__outsideHandler;
        }
    });

    editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeCommentMenu(dropdown);
        enterCommentEditMode(wrapper, comment);
    });

    deleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        closeCommentMenu(dropdown);
        await confirmAndDeleteComment(comment, wrapper);
    });

    return menuWrap;
}

function closeCommentMenu(menu) {
    if (!menu) return;
    menu.classList.remove('open');
    const toggle = menu.parentElement?.querySelector('.comment-menu-toggle');
    if (toggle) toggle.classList.remove('is-open');
    if (menu.__outsideHandler) {
        document.removeEventListener('click', menu.__outsideHandler);
        delete menu.__outsideHandler;
    }
}

function closeAllCommentMenus(exceptMenu = null) {
    document.querySelectorAll('.comment-menu-dropdown.open').forEach((menu) => {
        if (menu !== exceptMenu) closeCommentMenu(menu);
    });
}

function closeOtherCommentPanels(activePanel = null) {
    document.querySelectorAll('[data-comments-panel]').forEach((panel) => {
        if (panel !== activePanel && panel.style.display !== 'none') {
            panel.style.display = 'none';
        }
    });
}

function enterCommentEditMode(wrapper, comment) {
    if (!wrapper || !comment) return;
    if (wrapper.dataset.editing === 'true') return;
    const contentEl = wrapper.querySelector('.comment-content');
    if (!contentEl) return;
    wrapper.dataset.editing = 'true';
    contentEl.style.display = 'none';

    const editor = document.createElement('div');
    editor.className = 'comment-edit-block';
    const textarea = document.createElement('textarea');
    textarea.className = 'comment-edit-input';
    textarea.value = comment.content || '';
    editor.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'comment-edit-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'comment-action-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        exitCommentEditMode(wrapper);
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'comment-action-btn comment-action-primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
        await submitCommentEdit(comment, textarea.value, wrapper, saveBtn);
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    editor.appendChild(actions);

    contentEl.after(editor);
    wrapper.__commentEditor = { editor, textarea };
}

function exitCommentEditMode(wrapper) {
    if (!wrapper) return;
    wrapper.dataset.editing = 'false';
    const editorState = wrapper.__commentEditor;
    if (editorState?.editor) editorState.editor.remove();
    if (wrapper.__commentEditor) delete wrapper.__commentEditor;
    const contentEl = wrapper.querySelector('.comment-content');
    if (contentEl) contentEl.style.display = '';
}

async function submitCommentEdit(comment, newValue, wrapper, saveBtn) {
    const trimmed = safeTrim(newValue);
    const panel = wrapper?.closest('[data-comments-panel]');
    if (!trimmed) {
        showCommentStatus(panel, 'Comment cannot be empty.', true);
        return;
    }
    try {
        if (saveBtn) saveBtn.disabled = true;
        const user = await requireAuthUser();
        if (!user) return;
        showCommentStatus(panel, 'Saving comment...', false);
        const { error } = await supabase.from('comments').update({ content: trimmed }).eq('id', comment.id);
        if (error) throw error;
        comment.content = trimmed;
        commentCache.set(comment.id, comment);
        showCommentStatus(panel, 'Comment updated.', false);
        panel?.__refreshComments?.();
    } catch (err) {
        console.error('[Posts] update comment', err);
        showCommentStatus(panel, err?.message || 'Failed to update comment.', true);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
        exitCommentEditMode(wrapper);
    }
}

async function confirmAndDeleteComment(comment, wrapper) {
    if (!comment) return;
    const panel = wrapper?.closest('[data-comments-panel]');
    const ok = window.confirm('Delete this comment?');
    if (!ok) return;
    try {
        const user = await requireAuthUser();
        if (!user) return;
        showCommentStatus(panel, 'Deleting comment...', false);
        const { error } = await supabase.from('comments').delete().eq('id', comment.id);
        if (error) throw error;
        commentCache.delete(comment.id);
        panel?.__refreshComments?.();
        showCommentStatus(panel, 'Comment deleted.', false);
        if (comment.post_id) {
            const outerCount = document.querySelector(`[data-post-id="${comment.post_id}"] [data-comment-count]`);
            if (outerCount) setCommentCount(comment.post_id, outerCount);
        }
    } catch (err) {
        console.error('[Posts] delete comment', err);
        showCommentStatus(panel, err?.message || 'Failed to delete comment.', true);
    }
}

function commentInitial(value) {
    if (!value) return 'U';
    const str = String(value).trim();
    return str ? str.charAt(0).toUpperCase() : 'U';
}

function setAvatarVisual(container, { imgEl, letterEl, url, fallback } = {}) {
    if (!container) return;
    const letterTarget = letterEl || container.querySelector('.author-avatar-letter, .comment-avatar-letter') || container;
    const imageEl = imgEl || container.querySelector('img') || null;
    const letter = commentInitial(fallback || (letterTarget && letterTarget.textContent) || 'U');
    if (letterTarget && letterTarget !== imageEl) {
        letterTarget.textContent = letter;
    } else if (!imageEl) {
        container.textContent = letter;
    }
    if (imageEl) {
        imageEl.removeAttribute('src');
        imageEl.style.display = 'none';
    }
    container.classList.remove('has-image');
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    if (normalizedUrl && imageEl) {
        imageEl.src = normalizedUrl;
        imageEl.style.display = 'block';
        container.classList.add('has-image');
    }
}

function formatRoleLabel(value) {
    if (!value) return '';
    const normalized = String(value).trim();
    if (!normalized) return '';
    return normalized
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function formatDepartmentLabel(value) {
    if (!value) return '';
    const normalized = String(value).trim();
    return normalized ? normalized.toUpperCase() : '';
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}

function attachPostMenu(article, post, context = {}) {
    const toggle = article?.querySelector('[data-post-menu-toggle]');
    const menu = article?.querySelector('[data-post-menu]');
    if (!toggle || !menu) return;

    const contactBtn = menu.querySelector('[data-menu-action="contact"]');
    const copyBtn = menu.querySelector('[data-menu-action="copy"]');
    const reportBtn = menu.querySelector('[data-menu-action="report"]');
    const editBtn = menu.querySelector('[data-menu-action="edit"]');
    const deleteBtn = menu.querySelector('[data-menu-action="delete"]');
    const contactInfo = context.contactInfo || {};
    const authorName = context.authorName || 'Community member';
    const hasContacts = !!(safeTrim(contactInfo.email) || safeTrim(contactInfo.other));
    const authorAuthId = post?.metadata?.author_auth_id || post?.author_auth_id || null;
    const authorProfileId = post?.author_id || post?.metadata?.author_profile_id || null;
    const canModify = !!(
        (context.currentUserId && authorAuthId && context.currentUserId === authorAuthId) ||
        (context.currentProfileId && authorProfileId && context.currentProfileId === authorProfileId) ||
        (context.currentUserId && post?.author_id && context.currentUserId === post.author_id)
    );
    if (contactBtn) contactBtn.style.display = hasContacts ? 'flex' : 'none';
    if (editBtn) editBtn.style.display = canModify ? 'flex' : 'none';
    if (deleteBtn) deleteBtn.style.display = canModify ? 'flex' : 'none';

    menu.addEventListener('click', (e) => e.stopPropagation());

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const opening = !menu.classList.contains('open');
        closeAllPostMenus(opening ? menu : null);
        menu.classList.toggle('open', opening);
        toggle.classList.toggle('is-open', opening);
        if (opening) {
            const outsideHandler = (evt) => {
                if (!menu.contains(evt.target) && evt.target !== toggle) {
                    closePostMenu(menu);
                }
            };
            menu.__outsideHandler = outsideHandler;
            document.addEventListener('click', outsideHandler);
        } else if (menu.__outsideHandler) {
            document.removeEventListener('click', menu.__outsideHandler);
            delete menu.__outsideHandler;
        }
    });

    if (contactBtn && hasContacts) {
        contactBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openContactModal(contactInfo, authorName);
            closePostMenu(menu);
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await copyPostLink(post.id);
            closePostMenu(menu);
        });
    }

    if (reportBtn) {
        reportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            reportPost(post, authorName);
            closePostMenu(menu);
        });
    }

    if (editBtn && canModify) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const cached = postCache.get(post.id) || post;
            openPostModal({ mode: 'edit', post: cached });
            closePostMenu(menu);
        });
    }

    if (deleteBtn && canModify) {
        deleteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            closePostMenu(menu);
            await confirmAndDeletePost(post.id);
        });
    }
}

async function confirmAndDeletePost(postId) {
    const post = postCache.get(postId) || {};
    const preview = post.title || (post.body ? `${post.body.slice(0, 48)}…` : 'this post');
    const ok = window.confirm(`Delete "${preview}"? This cannot be undone.`);
    if (!ok) return;
    try {
        const user = await requireAuthUser();
        if (!user) return;
        const { error } = await supabase.from('posts').delete().eq('id', postId);
        if (error) throw error;
        await loadPosts();
    } catch (err) {
        console.error('[Posts] delete post', err);
        alert(err?.message || 'Failed to delete post.');
    }
}

function closePostMenu(menu) {
    if (!menu) return;
    menu.classList.remove('open');
    const toggle = menu.parentElement?.querySelector('[data-post-menu-toggle]');
    if (toggle) toggle.classList.remove('is-open');
    if (menu.__outsideHandler) {
        document.removeEventListener('click', menu.__outsideHandler);
        delete menu.__outsideHandler;
    }
}

function closeAllPostMenus(exceptMenu = null) {
    document.querySelectorAll('.post-menu-dropdown.open').forEach((menu) => {
        if (menu !== exceptMenu) closePostMenu(menu);
    });
}

function getPostPermalink(postId) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#post-${postId}`;
}

async function copyPostLink(postId) {
    const link = getPostPermalink(postId);
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(link);
            alert('Post link copied to clipboard');
        } else {
            sharePost(postId);
        }
    } catch (err) {
        console.warn('[Posts] copyPostLink', err);
        sharePost(postId);
    }
}

function openContactModal(contactInfo = {}, authorName = '') {
    if (!contactModal || !contactDetailsEl) return;
    const emailVal = safeTrim(contactInfo.email);
    const otherVal = safeTrim(contactInfo.other);
    if (!emailVal && !otherVal) return;

    contactDetailsEl.innerHTML = '';
    if (authorName) {
        const authorEl = document.createElement('div');
        authorEl.className = 'contact-modal-author';
        authorEl.textContent = authorName;
        contactDetailsEl.appendChild(authorEl);
    }
    if (emailVal) contactDetailsEl.appendChild(buildContactRow('fas fa-envelope', emailVal, `mailto:${emailVal}`));
    if (otherVal) {
        const href = /^https?:\/\//i.test(otherVal) ? otherVal : '';
        contactDetailsEl.appendChild(buildContactRow('fas fa-link', otherVal, href));
    }

    contactModal.style.display = 'flex';
    contactModal.setAttribute('aria-hidden', 'false');
}

function hideContactModal() {
    if (!contactModal) return;
    contactModal.style.display = 'none';
    contactModal.setAttribute('aria-hidden', 'true');
}

function buildContactRow(iconClass, text, href) {
    const row = document.createElement('div');
    row.className = 'contact-row';
    const icon = document.createElement('i');
    icon.className = iconClass;
    row.appendChild(icon);
    if (href) {
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = text;
        row.appendChild(anchor);
    } else {
        const span = document.createElement('span');
        span.textContent = text;
        row.appendChild(span);
    }
    return row;
}

function reportPost(post, authorName) {
    const label = post?.title || (post?.body ? `${post.body.slice(0, 60)}…` : 'this post');
    alert(`Thanks, we will review ${label} from ${authorName || 'this author'} soon.`);
}

function safeTrim(value) {
    return typeof value === 'string' ? value.trim() : '';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideContactModal();
        closeAllPostMenus();
        closeAllCommentMenus();
        closePostModal();
    }
});

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
            const panel = document.querySelector(`[data-post-id="${postId}"] [data-comments-panel]`);
            if (panel && panel.style.display !== 'none') {
                const list = panel.querySelector('[data-comments-list]');
                const emptyState = panel.querySelector('[data-comments-empty]');
                const countBadge = panel.querySelector('[data-comments-count]');
                loadComments(postId, list, { emptyState, countEl: countBadge });
            }
        });
        ch.subscribe();
    } catch (e) { console.warn('[Posts] realtime likes/comments failed', e); }
}

// Initial load
loadPosts();
wireCreatePostUI();
syncProfileFromSupabase();
hydrateProfileCard();
document.addEventListener('DOMContentLoaded', hydrateProfileCard);
window.addEventListener('auth-ready', () => {
    hydrateProfileCard();
    syncProfileFromSupabase(true);
});
window.addEventListener('storage', (ev) => {
    if (['diuProfile', 'user_profile'].includes(ev.key)) hydrateProfileCard();
});

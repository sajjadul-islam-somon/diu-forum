console.log('Studies page script loaded');

let currentUser = null;
let allOpportunities = [];
const savedOpportunityIds = new Set();
let savedFilterActive = false;
let currentProfileId = null;
let editingStudyId = null;

function getLocalUserInfo() {
    try {
        const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
        const raw = getter('user_info');
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function getDisplayNameFallback() {
    const local = getLocalUserInfo();
    if (local?.name && local.name !== local.email) return local.name;
    const metaName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name;
    if (metaName) return metaName;
    return 'Community member';
}

function getAvatarUrl() {
    const local = getLocalUserInfo();
    if (local?.avatar) return local.avatar;
    return currentUser?.user_metadata?.avatar_url || currentUser?.user_metadata?.picture || null;
}

function normalizePosterName(value) {
    if (!value) return 'Community member';
    const str = String(value).trim();
    if (!str) return 'Community member';
    if (str.includes('@')) {
        const namePart = str.split('@')[0].replace(/[._]/g, ' ').trim();
        const cleaned = namePart
            .split(' ')
            .filter(Boolean)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        return cleaned || 'Community member';
    }
    return str;
}

const STUDY_ITEM_TYPE = 'study';

const containerEl = document.getElementById('opportunities-container');
const resultsCountEl = document.getElementById('results-count');
const searchInput = document.getElementById('search-input');
const savedToggle = document.getElementById('saved-filter-toggle');
const typeFilter = document.getElementById('type-filter');
const fundingFilter = document.getElementById('funding-filter');
const countryFilter = document.getElementById('country-filter');

const detailModal = document.getElementById('opportunity-detail-modal');
const detailBody = document.getElementById('opportunity-detail-body');
const detailClose = document.getElementById('close-opportunity-detail');

const shareModal = document.getElementById('share-opportunity-modal');
const shareBtn = document.getElementById('share-opportunity-btn');
const shareCancel = document.getElementById('cancel-share');
const shareClose = document.getElementById('close-modal');
const shareForm = document.getElementById('share-opportunity-form');

async function init() {
    await loadCurrentUser();
    await hydrateSavedOpportunities();
    wireUI();
    await loadOpportunities();
    subscribeToProfileUpdates();
}

function showLoading() {
    if (resultsCountEl) {
        resultsCountEl.textContent = 'Loading opportunities…';
    }
    if (containerEl) {
        containerEl.innerHTML = '<div class="loader">Loading…</div>';
    }
}

function showError(message) {
    if (resultsCountEl) {
        resultsCountEl.textContent = 'Could not load opportunities';
    }
    if (containerEl) {
        containerEl.innerHTML = `<div style="padding: 1rem; color: #b91c1c; background: #fef2f2; border: 1px solid #fecdd3; border-radius: 10px;">${escapeHtml(message)}</div>`;
    }
}

async function loadCurrentUser() {
    try {
        // Prefer local cached profile (populated by auth.js) so we always have name/avatar even before Supabase session resolves
        const local = getLocalUserInfo();
        if (local) {
            currentUser = {
                id: local.id || null,
                email: local.email || null,
                user_metadata: {
                    full_name: local.name || null,
                    name: local.name || null,
                    avatar_url: local.avatar || null,
                    picture: local.avatar || null,
                },
            };
            currentProfileId = local.id || null;
        }

        if (window.supabaseClient) {
            const { data, error } = await window.supabaseClient.auth.getSession();
            if (!error && data?.session?.user) {
                currentUser = data.session.user;
                currentProfileId = currentUser?.id || currentProfileId;
            }
        }
    } catch (err) {
        console.error('Failed to load current user', err);
    }
}

async function hydrateSavedOpportunities() {
    try {
        const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
        const raw = getter('saved_studies') || '[]';
        const localSaved = JSON.parse(raw);
        localSaved.forEach(id => savedOpportunityIds.add(String(id)));
    } catch (_) {
        const remover = window?.safeLocal?.removeItem || (k => { try { localStorage.removeItem(k); } catch (_) {} });
        remover('saved_studies');
    }

    if (!window.supabaseClient) return;
    try {
        const profileId = await getCurrentProfileId();
        if (!profileId) return;
        const { data, error } = await window.supabaseClient
            .from('saved_items')
            .select('item_id')
            .eq('item_type', STUDY_ITEM_TYPE)
            .eq('profile_id', profileId);
        if (error) throw error;
        data?.forEach(row => savedOpportunityIds.add(String(row.item_id)));
        persistSavedOpportunities();
    } catch (err) {
        console.warn('Could not hydrate saved studies', err);
    }
}

function persistSavedOpportunities() {
    try {
        const setter = window?.safeLocal?.setItem || ((k, v) => { try { localStorage.setItem(k, v); } catch (_) {} });
        setter('saved_studies', JSON.stringify(Array.from(savedOpportunityIds)));
    } catch (_) {}
}

async function loadOpportunities() {
    showLoading();
    try {
        let opportunities = [];
        if (window.FirebaseAPI?.getEducationOpportunities) {
            opportunities = await window.FirebaseAPI.getEducationOpportunities();
        } else if (window.supabaseClient) {
            let data = null;
            try {
                const rpc = await window.supabaseClient.rpc('rpc_education_opportunities_with_profiles');
                if (!rpc.error) data = rpc.data || [];
                else console.warn('[Studies] rpc view failed:', rpc.error?.message || rpc.error);
            } catch (e) {
                console.warn('[Studies] rpc exception:', e?.message || e);
            }
            opportunities = Array.isArray(data) ? data : [];
            if (!opportunities.length) {
                const fb = await window.supabaseClient
                    .from('education_opportunities')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (!fb.error) {
                    opportunities = fb.data || [];
                } else {
                    console.error('[Studies] fallback base select failed:', fb.error?.message || fb.error);
                }
            }
        }
        allOpportunities = await enrichOpportunitiesWithProfiles(opportunities || []);
        filterOpportunities();
    } catch (err) {
        console.error('Failed to load studies', err);
        showError(err.message || 'Unable to load studies right now.');
    }
}

function filterOpportunities() {
    const searchTerm = (searchInput?.value || '').toLowerCase();
    const typeValue = typeFilter?.value || '';
    const fundingValue = fundingFilter?.value || '';
    const countryValue = countryFilter?.value || '';

    const filtered = allOpportunities.filter(item => {
        const id = getOpportunityId(item);
        if (savedFilterActive && !savedOpportunityIds.has(id)) return false;

        const haystack = [
            item.title,
            item.university,
            item.country,
            item.description,
            item.requirements,
            item.opportunity_type,
            item.type,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        if (searchTerm && !haystack.includes(searchTerm)) return false;
        if (typeValue && (item.opportunity_type || item.type || '').toLowerCase() !== typeValue.toLowerCase()) return false;
        if (fundingValue && (item.funding || item.funding_type || '').toLowerCase() !== fundingValue.toLowerCase()) return false;
        if (countryValue && (item.country || item.location || '').toLowerCase() !== countryValue.toLowerCase()) return false;
        return true;
    });

    displayOpportunities(filtered);
}

function displayOpportunities(opportunities) {
    if (!containerEl) return;

    if (!opportunities.length) {
        containerEl.innerHTML = '<div class="no-results">No opportunities match your filters.</div>';
        updateResultsInfo(0);
        return;
    }

    const cards = opportunities
        .map((opportunity, index) => {
            const meta = opportunity.metadata || {};
            const id = getOpportunityId(opportunity);
            const isSaved = savedOpportunityIds.has(id);
            const title = opportunity.title || 'Untitled Opportunity';
            const university = opportunity.university || opportunity.provider || meta.university || meta.provider || 'University';
            const country = opportunity.country || meta.country || 'Location';
            const funding = opportunity.funding || opportunity.funding_type || meta.funding || '';
            const type = opportunity.opportunity_type || opportunity.type || meta.opportunity_type || meta.type || '';
            const deadline = opportunity.deadline || meta.deadline || '';
            const applyUrl = meta.application_url || meta.applyUrl || '';
            const description = opportunity.description || meta.description || '';
            const requirements = parseRequirements(opportunity.requirements || meta.requirements);
            const rawPosterName = (opportunity.author_display_name || opportunity.author_full_name || opportunity.poster_display_name || opportunity.poster_full_name || meta.poster_display_name || meta.poster_name || opportunity.poster_name || getDisplayNameFallback()).trim();
            const posterName = normalizePosterName(rawPosterName);
            const posterAvatar = meta.poster_avatar || meta.poster_image || meta.poster_photo || '';
            const posterEmail = (meta.poster_email || opportunity.poster_email || '').toLowerCase();
            const currentEmail = (currentUser?.email || getLocalUserInfo()?.email || '').toLowerCase();
            const currentName = normalizePosterName(
                currentUser?.user_metadata?.full_name ||
                currentUser?.user_metadata?.name ||
                getLocalUserInfo()?.name ||
                ''
            ).toLowerCase();
            const posterNameKey = posterName.toLowerCase();
            const currentId = currentProfileId || currentUser?.id || getLocalUserInfo()?.id || null;
            const authorId = opportunity.author_id || meta.author_id || meta.profile_id || opportunity.profile_id || null;
            const isOwner = Boolean(
                (authorId && currentId && String(authorId) === String(currentId)) ||
                (posterEmail && currentEmail && posterEmail === currentEmail) ||
                (currentEmail && (opportunity.email || meta.email || '').toLowerCase() === currentEmail) ||
                (currentName && posterNameKey && currentName === posterNameKey)
            );
            const postedAt = opportunity.created_at || opportunity.createdAt || meta.created_at || null;

            return `
            <article class="opportunity-card job-card" data-id="${id}" id="study-${id}">
                <div class="job-top">
                    <div class="job-title">${escapeHtml(title)}</div>
                    <div class="job-menu">
                        <button class="job-menu-trigger" aria-label="Opportunity actions" aria-haspopup="true" aria-expanded="false" onclick="toggleStudyMenu(${index})">&#8942;</button>
                        <div class="job-menu-dropdown" id="study-menu-${index}" data-opportunity-id="${id}">
                            <button type="button" onclick="shareStudy('${id}')">Share</button>
                            ${isOwner ? `<button type="button" onclick="editStudy('${id}')">Edit</button>` : ''}
                            ${isOwner ? `<button type="button" class="danger" onclick="deleteStudy('${id}')">Delete</button>` : `<button type="button" onclick="reportStudy('${id}')">Report</button>`}
                        </div>
                    </div>
                </div>
                <div class="job-company-line">
                    <span class="job-company">${escapeHtml(university)}</span>
                    ${type ? `<span class="type-badge ${getTypeBadgeClass(type)}">${escapeHtml(type)}</span>` : ''}
                </div>
                <div class="job-meta-row">
                    ${country ? `<span class="job-location">${escapeHtml(country)}</span>` : ''}
                    ${deadline ? `<span class="job-deadline">Deadline: ${escapeHtml(formatDate(deadline))}</span>` : ''}
                </div>
                ${funding ? `<div class="job-funding-row">${escapeHtml(funding)}</div>` : ''}
                <div class="job-description">
                    <div class="job-snippet one-line">${escapeHtml(truncate(description, 180))}</div>
                    <button class="show-more-btn see-more-btn" data-id="${id}">See More</button>
                </div>
                ${requirements.length ? `
                    <div class="job-skills">
                        ${requirements.map(req => `<span class="skill-tag">${escapeHtml(req)}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="job-footer">
                    <div class="job-poster">
                        <div class="job-poster-avatar ${posterAvatar ? 'has-image' : ''}">${posterAvatar ? `<img src="${escapeHtml(posterAvatar)}" alt="${escapeHtml(posterName)}">` : getInitial(posterName)}</div>
                        <div class="job-poster-meta">
                            <div class="job-poster-name">${escapeHtml(posterName)}</div>
                            <div class="job-poster-time">${formatRelativeTime(postedAt)}</div>
                        </div>
                    </div>
                    <div class="job-actions">
                        <button class="save-btn ${isSaved ? 'saved' : ''}" data-id="${id}">${isSaved ? 'Saved' : 'Save'}</button>
                        ${applyUrl 
                            ? `<button class="apply-btn" onclick="window.open('${escapeHtml(applyUrl)}','_blank')">Apply Now</button>` 
                            : `<button class="apply-btn" onclick="openOpportunityDetails('${id}')">View Details</button>`}
                    </div>
                </div>
            </article>`;
        })
        .join('');

    containerEl.innerHTML = cards;
    updateResultsInfo(opportunities.length);
    refreshSaveButtons();
    bindCardEvents();
}

function closeAllStudyMenus() {
    containerEl?.querySelectorAll('.job-menu-dropdown').forEach(menu => menu.classList.remove('open'));
}

function toggleStudyMenu(index) {
    closeAllStudyMenus();
    const menu = document.getElementById(`study-menu-${index}`);
    if (menu) menu.classList.toggle('open');
}

async function shareStudy(id) {
    closeAllStudyMenus();
    const base = window.location.href.split('#')[0];
    const shareUrl = `${base}#study-${id}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'Study Opportunity', url: shareUrl });
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            alert('Link copied to clipboard');
        } else {
            alert(shareUrl);
        }
    } catch (err) {
        console.error('shareStudy failed', err);
        alert('Could not share this opportunity right now.');
    }
}

function editStudy(id) {
    closeAllStudyMenus();
    const form = shareForm;
    if (!form || !shareModal) return;
    const opportunity = allOpportunities.find(item => getOpportunityId(item) === id);
    if (!opportunity) return;
    editingStudyId = id;
    populateStudyForm(form, opportunity);
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Update Opportunity';
    shareModal.style.display = 'flex';
}

async function deleteStudy(id) {
    closeAllStudyMenus();
    if (!id) return;
    const confirmed = window.confirm('Delete this opportunity?');
    if (!confirmed) return;
    try {
        if (window.FirebaseAPI?.deleteEducationOpportunity) {
            await window.FirebaseAPI.deleteEducationOpportunity(id);
        } else if (window.supabaseClient) {
            const { error } = await window.supabaseClient.from('education_opportunities').delete().eq('id', id);
            if (error) throw error;
        }
        await loadOpportunities();
    } catch (err) {
        console.error('deleteStudy failed', err);
        alert('Could not delete this opportunity.');
    }
}

async function reportStudy(id) {
    closeAllStudyMenus();
    const reason = prompt('Please describe why you are reporting this study opportunity:');
    if (!reason || !reason.trim()) return;
    
    try {
        const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
        let userInfo = null;
        try {
            const stored = getter('user_info');
            userInfo = stored ? JSON.parse(stored) : null;
        } catch (_) { userInfo = null; }
        
        if (!window.supabaseClient) {
            alert('Unable to submit report. Please try again later.');
            return;
        }
        
        let reporterId = null;
        try {
            const session = await window.supabaseClient.auth.getSession();
            const user = session?.data?.session?.user;
            if (user?.id) {
                const { data: profile } = await window.supabaseClient
                    .from('profiles')
                    .select('id')
                    .eq('auth_id', user.id)
                    .maybeSingle();
                reporterId = profile?.id || null;
            }
        } catch (_) {}
        
        const { error } = await window.supabaseClient
            .from('reports')
            .insert({
                item_id: id,
                item_type: 'study',
                reason: reason.trim(),
                reporter_id: reporterId,
                reporter_email: userInfo?.email || null
            });
        
        if (error) throw error;
        alert('Report submitted successfully. Thank you for helping keep our community safe.');
    } catch (err) {
        console.error('[Studies] Failed to submit report', err);
        alert('Failed to submit report. Please try again.');
    }
}

function bindCardEvents() {
    containerEl.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!id) { alert('Cannot save: missing opportunity ID'); return; }
            await toggleSaveOpportunity(id);
        });
    });

    containerEl.querySelectorAll('.see-more-btn').forEach(btn => {
        btn.addEventListener('click', () => openOpportunityDetails(btn.dataset.id));
    });
}

function subscribeToProfileUpdates() {
    if (!window.supabaseClient?.channel) return;
    try {
        const channel = window.supabaseClient.channel('studies_profiles_updates');
        channel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
                try {
                    await loadOpportunities();
                } catch (e) {
                    console.warn('[Studies] reload after profile change failed', e);
                }
            })
            .subscribe();
    } catch (e) {
        console.warn('[Studies] subscribeToProfileUpdates', e);
    }
}

async function enrichOpportunitiesWithProfiles(items) {
    try {
        const list = Array.isArray(items) ? items : [];
        const authorIds = Array.from(new Set(list.map(i => i.author_id || i.profile_id || i.metadata?.author_id).filter(Boolean)));
        if (!authorIds.length || !window.supabaseClient) return list;
        const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('id, display_name, full_name, role, department, institution, avatar_url')
            .in('id', authorIds);
        if (error || !Array.isArray(data)) return list;
        const byId = new Map(data.map(p => [String(p.id), p]));
        return list.map(i => {
            const aid = i.author_id || i.profile_id || i.metadata?.author_id || null;
            const p = aid ? byId.get(String(aid)) : null;
            if (!p) return i;
            return {
                ...i,
                author_display_name: p.display_name || p.full_name || i.poster_display_name || i.poster_full_name || null,
                author_full_name: p.full_name || null,
                author_role: p.role || null,
                author_department: p.department || null,
                author_institution: p.institution || null,
                author_avatar: p.avatar_url || i.poster_avatar || null,
            };
        });
    } catch (_) {
        return items;
    }
}

function updateResultsInfo(count) {
    if (!resultsCountEl) return;
    resultsCountEl.textContent = `${count} ${count === 1 ? 'opportunity' : 'opportunities'} found`;
}

function truncate(text, max = 160) {
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
}

function parseRequirements(reqs) {
    if (!reqs) return [];
    if (Array.isArray(reqs)) return reqs;
    return String(reqs)
        .split(/,|\n|;/)
        .map(r => r.trim())
        .filter(Boolean);
}

function getTypeBadgeClass(type) {
    const key = String(type || '').toLowerCase();
    if (key.includes('phd')) return 'phd-badge';
    if (key.includes('master')) return 'masters-badge';
    if (key.includes('bachelor')) return 'bachelors-badge';
    if (key.includes('postdoc')) return 'postdoc-badge';
    if (key.includes('fellow')) return 'fellowship-badge';
    if (key.includes('scholar')) return 'scholarship-badge';
    if (key.includes('exchange')) return 'exchange-badge';
    if (key.includes('summer')) return 'summer-school-badge';
    if (key.includes('research')) return 'research-badge';
    return 'research-badge';
}

async function toggleSaveOpportunity(id) {
    if (!id) return;
    const isSaved = savedOpportunityIds.has(id);

    if (!currentUser) {
        alert('Please sign in to save opportunities.');
        return;
    }

    try {
        const profileId = await ensureProfileExists();
        if (!profileId) throw new Error('Profile missing');

        if (!isSaved) {
            savedOpportunityIds.add(id);
            if (window.supabaseClient) {
                const rpc = await window.supabaseClient.rpc('saved_items_upsert', { p_profile_id: profileId, p_item_id: id, p_item_type: STUDY_ITEM_TYPE });
                if (rpc.error) throw rpc.error;
            }
        } else {
            savedOpportunityIds.delete(id);
            if (window.supabaseClient) {
                const rpc = await window.supabaseClient.rpc('saved_items_delete', { p_profile_id: profileId, p_item_id: id, p_item_type: STUDY_ITEM_TYPE });
                if (rpc.error) throw rpc.error;
            }
        }
    } catch (err) {
        console.warn('Save RPC failed; attempting direct table write', err);
        try {
            if (!isSaved) {
                const { error } = await window.supabaseClient.from('saved_items').upsert({
                    profile_id: profileId,
                    item_id: id,
                    item_type: STUDY_ITEM_TYPE,
                });
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient
                    .from('saved_items')
                    .delete()
                    .eq('profile_id', profileId)
                    .eq('item_id', id)
                    .eq('item_type', STUDY_ITEM_TYPE);
                if (error) throw error;
            }
        } catch (e2) {
            console.warn('Save direct write failed (local-only)', e2);
            // Keep local saved state and UI; suppress alerts under RLS
        }
    }

    persistSavedOpportunities();
    refreshSaveButtons();
    if (savedFilterActive) filterOpportunities();
}

function refreshSaveButtons() {
    containerEl?.querySelectorAll('.save-btn').forEach(btn => {
        const id = btn.dataset.id;
        if (savedOpportunityIds.has(id)) {
            btn.classList.add('saved');
            btn.textContent = 'Saved';
        } else {
            btn.classList.remove('saved');
            btn.textContent = 'Save';
        }
    });
}

async function ensureProfileExists() {
    if (!window.supabaseClient || !currentUser || !currentUser.id) return null;
    const userId = currentUser.id;
    const lowerEmail = (currentUser.email || '').toLowerCase() || null;
    try {
        const existing = await window.supabaseClient
            .from('profiles')
            .select('id')
            .eq('auth_id', userId)
            .maybeSingle();
        if (existing?.data?.id) return existing.data.id;

        const insertPayload = {
            auth_id: userId,
            email: lowerEmail,
            primary_email: lowerEmail,
            full_name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || lowerEmail,
            display_name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || lowerEmail,
            avatar_url: currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await window.supabaseClient
            .from('profiles')
            .insert(insertPayload)
            .select('id')
            .single();
        if (error) throw error;
        return data?.id || null;
    } catch (err) {
        console.error('ensureProfileExists failed', err);
        return null;
    }
}

async function resolveStudyProfileId() {
    if (currentProfileId) return currentProfileId;
    if (!window.supabaseClient) return null;
    try {
        const session = await window.supabaseClient.auth.getSession();
        const user = session?.data?.session?.user || null;
        if (user) currentUser = user;
    } catch (_) {}
    try {
        const existing = await getCurrentProfileId();
        if (existing) {
            currentProfileId = existing;
            return currentProfileId;
        }
    } catch (_) {}

    const profileId = await ensureProfileExists();
    if (profileId) currentProfileId = profileId;
    return currentProfileId;
}

async function getCurrentProfileId() {
    if (!currentUser || !currentUser.id) return null;
    try {
        const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('id')
            .eq('auth_id', currentUser.id)
            .single();
        if (error) throw error;
        return data?.id || null;
    } catch (err) {
        console.warn('getCurrentProfileId failed', err);
        return null;
    }
}

function openOpportunityDetails(id) {
    const opportunity = allOpportunities.find(item => getOpportunityId(item) === id);
    if (!opportunity || !detailModal || !detailBody) return;

    const meta = opportunity.metadata || {};
    const title = opportunity.title || 'Untitled Opportunity';
    const university = opportunity.university || meta.university || 'University';
    const country = opportunity.country || meta.country || 'Country';
    const funding = opportunity.funding || opportunity.funding_type || meta.funding || 'Funding';
    const type = opportunity.opportunity_type || opportunity.type || meta.type || 'Study';
    const deadline = opportunity.deadline || meta.deadline || '';
    const applyUrl =
        opportunity.application_url ||
        opportunity.applyUrl ||
        opportunity.apply_url ||
        meta.application_url ||
        meta.applyUrl ||
        meta.apply_url ||
        '';
    const description = opportunity.description || meta.description || 'No description provided.';
    const requirements = parseRequirements(opportunity.requirements || meta.requirements);
    const rawPosterName = meta.poster_display_name || meta.poster_name || opportunity.poster_name || getDisplayNameFallback();
    const posterName = normalizePosterName(rawPosterName);
    const posterAvatar = meta.poster_avatar || meta.poster_image || meta.poster_photo || '';

    detailBody.innerHTML = `
        <h3 style="font-size:1.35rem; margin-bottom:0.35rem;">${escapeHtml(title)}</h3>
        <p style="color:#2563eb; font-weight:700; margin-bottom:0.5rem;">${escapeHtml(university)}</p>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.85rem;">
            <span class="type-badge ${getTypeBadgeClass(type)}">${escapeHtml(type)}</span>
            <span class="type-badge country-badge">${escapeHtml(country)}</span>
            <span class="type-badge funding-badge">${escapeHtml(funding)}</span>
            ${deadline ? `<span class="type-badge deadline-badge">Deadline: ${escapeHtml(formatDate(deadline))}</span>` : ''}
        </div>
        <div class="detail-section">
            <h4>Description</h4>
            <p style="color:#1f2937;">${escapeHtml(description)}</p>
        </div>
        ${requirements.length ? `
        <div class="detail-section">
            <h4>Requirements</h4>
            <div class="requirement-tags">
                ${requirements.map(req => `<span class="requirement-tag">${escapeHtml(req)}</span>`).join('')}
            </div>
        </div>` : ''}
        <div class="opportunity-meta" style="margin-top:1rem;">
            <div>
                <div class="detail-label">Country</div>
                <div class="detail-value">${escapeHtml(country)}</div>
            </div>
            <div>
                <div class="detail-label">Funding</div>
                <div class="detail-value">${escapeHtml(funding)}</div>
            </div>
            <div>
                <div class="detail-label">Deadline</div>
                <div class="detail-value">${deadline ? escapeHtml(formatDate(deadline)) : 'Rolling'}</div>
            </div>
            <div>
                <div class="detail-label">Type</div>
                <div class="detail-value">${escapeHtml(type)}</div>
            </div>
        </div>
        ${applyUrl ? `<a class="apply-btn" style="margin-top:1rem; display:inline-flex; align-items:center; gap:0.4rem;" href="${applyUrl}" target="_blank" rel="noopener">Apply Now</a>` : ''}
        <div style="margin-top:1rem; color:#475569; display:flex; align-items:center; gap:0.5rem;">
            <div class="job-poster-avatar ${posterAvatar ? 'has-image' : ''}" style="width:32px; height:32px;">${posterAvatar ? `<img src="${escapeHtml(posterAvatar)}" alt="${escapeHtml(posterName)}">` : getInitial(posterName)}</div>
            <span>Shared by ${escapeHtml(posterName)}</span>
        </div>
    `;

    detailModal.style.display = 'flex';
}

function closeOpportunityDetails() {
    if (detailModal) detailModal.style.display = 'none';
}

function wireUI() {
    searchInput?.addEventListener('input', filterOpportunities);
    typeFilter?.addEventListener('change', filterOpportunities);
    fundingFilter?.addEventListener('change', filterOpportunities);
    countryFilter?.addEventListener('change', filterOpportunities);

    savedToggle?.addEventListener('click', () => {
        savedFilterActive = !savedFilterActive;
        savedToggle.classList.toggle('active', savedFilterActive);
        filterOpportunities();
    });

    detailClose?.addEventListener('click', closeOpportunityDetails);
    detailModal?.addEventListener('click', evt => {
        if (evt.target === detailModal) closeOpportunityDetails();
    });

    shareBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Mirror Jobs modal gating: require signed-in DIU account before opening
        const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
        let userInfo = null;
        try { const stored = getter('user_info'); userInfo = stored ? JSON.parse(stored) : null; } catch (_) { userInfo = null; }
        const email = (userInfo?.email || '').toLowerCase();
        const hasDiuEmail = email.endsWith('@diu.edu.bd');
        if (!userInfo || !hasDiuEmail) {
            alert('Please sign in with your @diu.edu.bd account to share opportunities.');
            try { if (window.signInWithGoogle) await window.signInWithGoogle(); } catch (_) {}
            return;
        }
        editingStudyId = null;
        shareForm?.reset();
        const submitBtn = shareForm?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Share Opportunity';
        if (shareModal) shareModal.style.display = 'flex';
    });
    const resetShareModal = () => {
        editingStudyId = null;
        shareForm?.reset();
        const submitBtn = shareForm?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Share Opportunity';
    };

    shareClose?.addEventListener('click', () => {
        resetShareModal();
        if (shareModal) shareModal.style.display = 'none';
    });
    shareCancel?.addEventListener('click', () => {
        resetShareModal();
        if (shareModal) shareModal.style.display = 'none';
    });
    shareModal?.addEventListener('click', evt => {
        if (evt.target === shareModal) {
            resetShareModal();
            shareModal.style.display = 'none';
        }
    });

    shareForm?.addEventListener('submit', handleShareSubmit);

    document.addEventListener('click', evt => {
        if (!evt.target.closest('.job-menu')) {
            closeAllStudyMenus();
        }
    });
}

async function handleShareSubmit(event) {
    event.preventDefault();
    if (!shareForm) return;

    const formData = new FormData(shareForm);
    // Require an active Supabase session (authenticated DIU account) before proceeding
    if (window.supabaseClient) {
        try {
            const { data } = await window.supabaseClient.auth.getSession();
            const user = data?.session?.user || null;
            if (!user) {
                alert('Please sign in with your @diu.edu.bd account before sharing.');
                try { if (window.signInWithGoogle) await window.signInWithGoogle(); } catch (_) {}
                return;
            }
            currentUser = user;
        } catch (_) {
            alert('Could not verify your session. Please sign out and sign in again with your DIU account.');
            return;
        }
    } else {
        alert('Backend not initialized. Please refresh the page after sign-in.');
        return;
    }
    const profileId = await resolveStudyProfileId();
    if (!profileId) {
        alert('Could not create your profile. Please sign out and sign in again with your DIU account.');
        return;
    }
    const payload = buildStudyPayload(formData, profileId, currentUser?.id || null);

    try {
        if (editingStudyId) {
            await updateStudy(editingStudyId, payload);
            alert('Opportunity updated successfully!');
        } else {
            if (window.FirebaseAPI?.createEducationOpportunity) {
                await window.FirebaseAPI.createEducationOpportunity(payload);
            } else if (window.supabaseClient) {
                const insertPayload = { ...payload };
                const { error } = await window.supabaseClient.from('education_opportunities').insert(insertPayload);
                if (error) throw error;
            }
            alert('Opportunity shared successfully!');
        }
        shareForm.reset();
        if (shareModal) shareModal.style.display = 'none';
        editingStudyId = null;
        const submitBtn = shareForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Share Opportunity';
        await loadOpportunities();
    } catch (err) {
        console.error('Share failed', err);
        const msg = err?.message || err?.error?.message || 'Could not share opportunity. Please try again.';
        alert(msg);
    }
}

function buildStudyPayload(formData, profileId = null, authId = null) {
    const authorId = profileId || currentProfileId || null;
    return {
        title: (formData.get('title') || '').trim(),
        provider: (formData.get('university') || formData.get('provider') || '').trim(),
        description: (formData.get('description') || '').trim(),
        // Let DB trigger assign author_id securely; send NULL to satisfy relaxed policy
        author_id: null,
        metadata: {
            country: (formData.get('country') || '').trim(),
            opportunity_type: (formData.get('opportunity_type') || formData.get('opportunityType') || formData.get('type') || '').trim(),
            funding: (formData.get('funding') || '').trim(),
            deadline: formData.get('deadline') || null,
            requirements: (formData.get('requirements') || '').trim(),
            application_url: (formData.get('application_url') || formData.get('applicationUrl') || formData.get('applyUrl') || '').trim(),
            poster_name: getDisplayNameFallback(),
            poster_display_name: normalizePosterName(getDisplayNameFallback()),
            poster_email: currentUser?.email || getLocalUserInfo()?.email || '',
            poster_avatar: getAvatarUrl() || '',
            submitted_via: 'studies_form',
            author_id: authorId || undefined,
            auth_id: authId || currentUser?.id || undefined,
            profile_id: authorId || undefined,
        },
    };
}

async function updateStudy(id, payload) {
    if (!id) throw new Error('Missing study id');
    const profileId = await resolveStudyProfileId();
    // Do not modify author_id on update; keep existing ownership set by DB
    const normalizedPayload = { ...payload };
    if (window.FirebaseAPI?.updateEducationOpportunity) {
        await window.FirebaseAPI.updateEducationOpportunity(id, normalizedPayload);
        return;
    }
    if (!window.supabaseClient) throw new Error('No backend available for updates');

    const updatePayload = {
        title: normalizedPayload.title,
        provider: normalizedPayload.provider,
        description: normalizedPayload.description,
        metadata: normalizedPayload.metadata,
    };

    const { error } = await window.supabaseClient
        .from('education_opportunities')
        .update(updatePayload)
        .eq('id', id);
    if (error) throw error;
}

function populateStudyForm(form, opportunity) {
    if (!form || !opportunity) return;
    const meta = opportunity.metadata || {};
    const setValue = (selector, value) => {
        const el = form.querySelector(selector);
        if (!el) return;
        if ('value' in el) el.value = value || '';
        else el.setAttribute('value', value || '');
    };

    setValue('[name="title"]', opportunity.title);
    setValue('[name="university"]', opportunity.university || opportunity.provider || meta.university || meta.provider);
    setValue('[name="provider"]', opportunity.provider || meta.provider || opportunity.university);
    const descEl = form.querySelector('[name="description"]');
    if (descEl) descEl.value = opportunity.description || meta.description || '';
    setValue('[name="country"]', opportunity.country || meta.country);
    setValue('[name="opportunity_type"]', opportunity.opportunity_type || opportunity.type || meta.opportunity_type || meta.type);
    setValue('[name="funding"]', opportunity.funding || opportunity.funding_type || meta.funding);
    setValue('[name="deadline"]', opportunity.deadline || meta.deadline);
    const reqEl = form.querySelector('[name="requirements"]');
    if (reqEl) reqEl.value = opportunity.requirements || meta.requirements || '';
    setValue('[name="application_url"]', meta.application_url || meta.applyUrl);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getInitial(name) {
    return (name || '')
        .trim()
        .charAt(0)
        .toUpperCase() || 'S';
}

function formatDate(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return dateInput;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(dateInput) {
    if (!dateInput) return 'Recently added';
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return 'Recently added';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(days / 365);
    return `${years}y ago`;
}

function getOpportunityId(opportunity) {
    // Must be a UUID to satisfy saved_items.item_id UUID type
    const id = opportunity?.id || opportunity?._id || opportunity?.uuid;
    return id ? String(id) : '';
}

window.addEventListener('load', init);

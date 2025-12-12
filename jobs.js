console.log('[Jobs] Script loaded');
let currentUser = null;
let allJobs = [];
let savedJobIds = new Set();
const JOB_ITEM_TYPE = 'job';
let editingJobId = null;
let currentProfileId = null;

// Initialize page
window.addEventListener('load', async () => {
    console.log('[Jobs] Page loaded, initializing...');
    try {
        const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
        const stored = getter('user_info');
        currentUser = stored ? JSON.parse(stored) : null;
    } catch (_) {}
    await hydrateSavedJobs();
    await loadJobs();
    subscribeToProfileUpdates();
    wireUI();
    console.log('[Jobs] Initialization complete');
});

function showLoading() {
    const container = document.getElementById('jobs-container');
    if (container) container.innerHTML = '<p>Loading job opportunities...</p>';
}

function showError(message) {
    const container = document.getElementById('jobs-container');
    if (container) container.innerHTML = `<p>${message}</p>`;
}

async function loadJobs() {
    showLoading();
    try {
        let jobs = [];
        if (window.FirebaseAPI && typeof window.FirebaseAPI.getJobs === 'function') {
            jobs = await window.FirebaseAPI.getJobs();
        } else if (window.supabaseClient) {
                let data = null;
                try {
                    const rpc = await window.supabaseClient.rpc('rpc_jobs_with_profiles');
                    if (!rpc.error) data = rpc.data || [];
                    else console.warn('[Jobs] rpc_jobs_with_profiles failed:', rpc.error?.message || rpc.error);
                } catch (e) {
                    console.warn('[Jobs] rpc_jobs_with_profiles exception:', e?.message || e);
                }
                jobs = Array.isArray(data) ? data : [];
                if (!jobs.length) {
                    const fallback = await window.supabaseClient
                        .from('jobs')
                        .select('*')
                        .order('created_at', { ascending: false });
                    if (!fallback.error) {
                        jobs = fallback.data || [];
                    } else {
                        console.error('[Jobs] fallback jobs query failed:', fallback.error?.message || fallback.error);
                    }
                }
        }
        allJobs = await enrichJobsWithProfiles(jobs);
        filterJobs();
    } catch (err) {
        console.error('[Jobs] loadJobs', err);
        showError('Failed to load job opportunities. Please refresh and try again.');
    }
}

async function resolveJobProfileId() {
    if (currentProfileId) return currentProfileId;
    if (window.supabaseClient) {
        try {
            const session = await window.supabaseClient.auth.getSession();
            const user = session?.data?.session?.user || null;
            if (user) currentUser = user;
        } catch (_) {}
    }
    const profileId = await ensureJobProfileExists();
    if (profileId) currentProfileId = profileId;
    return currentProfileId;
}

function displayJobs(jobs) {
    const container = document.getElementById('jobs-container');
    const resultsInfo = document.querySelector('.results-info');
    if (!container) return;

    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<p>No job opportunities found.</p>';
        if (resultsInfo) resultsInfo.classList.add('hidden');
        return;
    }
    if (resultsInfo) resultsInfo.classList.remove('hidden');

    container.innerHTML = jobs.map((job, index) => {
        const meta = job.metadata || {};
        const desc = job.description || '';
        let postedByName = (job.author_display_name || job.author_full_name || job.poster_display_name || job.poster_full_name || meta.poster_display_name || meta.poster_name || '').trim();
            const postedByRole = job.author_role || job.poster_role || meta.poster_role || meta.role || '';
            const postedByDept = job.author_department || job.author_institution || job.poster_department || job.poster_institution || meta.poster_department || meta.department || '';
        const looksLikeEmail = (str) => /.+@.+\..+/.test(String(str || ''));
        if (!postedByName || looksLikeEmail(postedByName)) {
            const profileName = meta.profile_name || meta.full_name || meta.display_name || '';
            postedByName = profileName || (meta.poster_email || '') || postedByName || 'User';
        }
        const postedAt = job.created_at || '';
        const postedAtText = postedAt ? formatDate(postedAt) : '';
        let posterAvatar = job.author_avatar || job.poster_avatar || meta.poster_avatar || '';
        const posterInitial = getInitial(postedByName);
        const profileIdForOwnership = currentProfileId || currentUser?.profile_id || currentUser?.profileId || currentUser?.profile?.id || null;
        const currentEmail = (currentUser?.email || '').toLowerCase();
        const currentName = (currentUser?.name || currentUser?.displayName || '').toLowerCase();
        const department = meta.department || job.department || '';
        const jobType = meta.job_type || job.job_type || '';
        const jobTypeKey = jobType ? jobType.toLowerCase().replace(/\s+/g, '-') : '';
        const jobTypeClass = jobTypeKey ? `${jobTypeKey}-badge` : '';
        const posterEmail = (meta.poster_email || '').toLowerCase();
        const isOwner = Boolean(
            (job.author_id && profileIdForOwnership && String(job.author_id) === String(profileIdForOwnership)) ||
            (posterEmail && currentEmail && posterEmail === currentEmail) ||
            (!posterEmail && currentName && postedByName && postedByName.toLowerCase() === currentName)
        );
        const isSaved = savedJobIds.has(String(job.id));

        return `
            <div class="job-card" id="job-${job.id}">
                <div class="job-top">
                    <div class="job-title">${escapeHtml(job.title || '')}</div>
                    <div class="job-menu">
                        <button class="job-menu-trigger" aria-label="Job actions" aria-haspopup="true" aria-expanded="false" onclick="toggleJobMenu(${index})">&#8942;</button>
                        <div class="job-menu-dropdown" id="job-menu-${index}" data-job-id="${job.id}">
                            <button type="button" onclick="shareJob('${job.id}')">Share</button>
                            ${isOwner ? `<button type="button" onclick="editJob('${job.id}')">Edit</button>` : ''}
                            ${isOwner ? `<button type="button" class="danger" onclick="deleteJob('${job.id}')">Delete</button>` : `<button type="button" onclick="reportJob('${job.id}')">Report</button>`}
                        </div>
                    </div>
                </div>
                <div class="job-company-line">
                    <span class="job-company">${escapeHtml(job.company || '')}</span>
                    ${jobType ? `<span class="type-badge ${jobTypeClass}">${escapeHtml(jobType)}</span>` : ''}
                </div>
                <div class="job-meta-row">
                    <span class="job-location">${escapeHtml(job.location || '')}</span>
                </div>
                
                <div class="job-description">
                    <div class="job-snippet">${escapeHtml(desc)}</div>
                    <button class="show-more-btn" onclick="openJobDetails('${job.id}')">See More</button>
                </div>
                ${meta.required_skills ? `
                    <div class="job-skills">
                        ${meta.required_skills.split(',').map(s => `<span class="skill-tag">${escapeHtml(s.trim())}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="job-footer">
                    <div class="job-poster">
                        <div class="job-poster-avatar ${posterAvatar ? 'has-image' : ''}">
                            ${posterAvatar ? `<img src="${escapeHtml(posterAvatar)}" alt="${escapeHtml(postedByName)}'s avatar">` : `<span>${escapeHtml(posterInitial)}</span>`}
                        </div>
                        <div class="job-poster-meta">
                            <div class="job-poster-name">${escapeHtml(postedByName)}</div>
                            
                            ${postedAtText ? `<div class="job-poster-time">${escapeHtml(postedAtText)}</div>` : ''}
                        </div>
                    </div>
                    <div class="job-actions">
                        <button class="save-btn ${isSaved ? 'saved' : ''}" onclick="toggleSave('${job.id}')">${isSaved ? 'Saved' : 'Save'}</button>
                        ${meta.application_url ? `<button class="apply-btn" onclick="window.open('${escapeHtml(meta.application_url)}', '_blank')">Apply Now</button>` : `<button class="apply-btn" onclick="openJobDetails('${job.id}')">View Details</button>`}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const resultsCount = document.getElementById('results-count');
    if (resultsCount) {
        resultsCount.textContent = `${jobs.length} ${jobs.length === 1 ? 'opportunity' : 'opportunities'} found`;
    }
}

function formatDate(dateString) {
    try {
        const d = new Date(dateString);
        if (isNaN(d)) return '';
        const now = new Date();
        const diffMs = Math.max(0, now - d);
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        if (days < 30) return `${Math.floor(days / 7)}w ago`;
        return d.toLocaleDateString();
    } catch (e) { return ''; }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function getInitial(value) {
    if (!value) return 'U';
    const trimmed = String(value).trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'U';
}

function wireUI() {
    console.log('[Jobs] wireUI called');
    const modal = document.getElementById('post-job-modal');
    const postJobBtn = document.getElementById('post-job-btn');
    const closeModal = document.getElementById('close-modal');
    const cancelPost = document.getElementById('cancel-post');

    const detailModal = document.getElementById('job-detail-modal');
    const closeDetail = document.getElementById('close-job-detail');

    if (postJobBtn) {
        postJobBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
                const stored = getter('user_info');
                var userInfo = null;
                try { userInfo = stored ? JSON.parse(stored) : null; } catch (_) { userInfo = null; }
            } catch (_) { var userInfo = null; }
            const email = userInfo?.email || '';
            const hasDiuEmail = email.toLowerCase().endsWith('@diu.edu.bd');
            if (!userInfo || !hasDiuEmail) {
                alert('Please sign in with your @diu.edu.bd account to post job opportunities.');
                try { if (window.signInWithGoogle) await window.signInWithGoogle(); } catch (_) {}
                return;
            }
            editingJobId = null;
            resetJobForm(jobForm);
            if (modal) modal.style.display = 'flex';
        });
    }
    if (closeModal) closeModal.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    if (cancelPost) cancelPost.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });

    if (closeDetail) closeDetail.addEventListener('click', closeJobDetails);
    if (detailModal) {
        detailModal.addEventListener('click', (e) => { if (e.target === detailModal) closeJobDetails(); });
    }

    const jobForm = document.getElementById('post-job-form');
    if (jobForm) {
        jobForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                try {
                    const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
                    const stored = getter('user_info');
                    currentUser = stored ? JSON.parse(stored) : currentUser;
                } catch (err) { currentUser = currentUser || null; }
            } catch (err) { currentUser = currentUser || null; }
            if (!currentUser && window.supabaseClient) {
                try {
                    const session = await window.supabaseClient.auth.getSession();
                    currentUser = session?.data?.session?.user || currentUser;
                } catch (_) {}
            }
            if (!currentUser) { alert('Please sign in to post a job'); return; }

            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.textContent = 'Posting Job...'; submitBtn.disabled = true; }

            const formData = new FormData(e.target);
            const profileId = await resolveJobProfileId();
            const payload = {
                title: formData.get('title'),
                company: formData.get('company'),
                location: formData.get('location'),
                description: formData.get('description'),
                author_id: profileId || null,
                metadata: {
                    job_type: formData.get('job_type'),
                    department: formData.get('department'),
                    required_skills: formData.get('required_skills'),
                    application_url: formData.get('application_url'),
                    company_contact: formData.get('company_contact'),
                    poster_name: currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || currentUser?.displayName || currentUser?.name || currentUser?.email || null,
                    poster_avatar: currentUser?.avatar || currentUser?.photoURL || currentUser?.photoUrl || null,
                    poster_email: currentUser?.email || null,
                    author_id: profileId || undefined,
                    profile_id: profileId || undefined
                }
            };

            try {
                if (editingJobId) {
                    await updateJob(editingJobId, payload);
                } else {
                    if (window.FirebaseAPI && typeof window.FirebaseAPI.createJob === 'function') {
                        await window.FirebaseAPI.createJob(payload);
                    } else if (window.supabaseClient) {
                        const { data, error } = await window.supabaseClient.rpc('insert_job', {
                            job_title: payload.title,
                            job_company: payload.company,
                            job_location: payload.location,
                            job_description: payload.description,
                            job_author_id: payload.author_id,
                            job_metadata: payload.metadata
                        });
                        if (error) {
                            const result = await window.supabaseClient.from('jobs').insert(payload);
                            if (result.error) throw result.error;
                        }
                    }
                }
                editingJobId = null;
                if (submitBtn) submitBtn.textContent = editingJobId ? 'Update Job' : 'Post Job';
                if (modal) modal.style.display = 'none';
                if (jobForm) jobForm.reset();
                await loadJobs();
            } catch (err) {
                console.error('[Jobs] create job', err);
                const errEl = document.getElementById('jobError');
                if (errEl) errEl.textContent = err.message || 'Failed to post job';
                else alert('Failed to post job: ' + (err.message || 'unknown'));
            } finally {
                if (submitBtn) { submitBtn.textContent = originalText; submitBtn.disabled = false; }
            }
        });
    }

    const searchInput = document.getElementById('search-input');
    const savedToggle = document.getElementById('saved-filter-toggle');
    const deptSelect = document.getElementById('department-filter');
    const typeSelect = document.getElementById('type-filter');
    if (searchInput) searchInput.addEventListener('input', filterJobs);
    if (savedToggle) savedToggle.addEventListener('click', () => {
        savedToggle.classList.toggle('active');
        filterJobs();
    });
    if (deptSelect) deptSelect.addEventListener('change', filterJobs);
    if (typeSelect) typeSelect.addEventListener('change', filterJobs);
}

function filterJobs() {
    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    const savedActive = document.getElementById('saved-filter-toggle')?.classList.contains('active');
    const departmentFilter = document.getElementById('department-filter')?.value || '';
    const typeFilter = document.getElementById('type-filter')?.value || '';

    const filtered = (allJobs || []).filter(job => {
        const title = (job.title || '').toLowerCase();
        const company = (job.company || '').toLowerCase();
        const location = (job.location || '').toLowerCase();
        const meta = job.metadata || {};
        const desc = (job.description || meta.description || '').toLowerCase();
        const skills = (meta.required_skills || job.required_skills || '').toLowerCase();
        const matchesSearch = !searchTerm || title.includes(searchTerm) || company.includes(searchTerm) || location.includes(searchTerm) || desc.includes(searchTerm) || skills.includes(searchTerm);
        const matchesDept = !departmentFilter || (job.department === departmentFilter) || (meta.department === departmentFilter);
        const matchesType = !typeFilter || (meta.job_type === typeFilter) || (job.job_type === typeFilter);
        const matchesSaved = !savedActive || savedJobIds.has(String(job.id));
        return matchesSearch && matchesDept && matchesType && matchesSaved;
    });
    displayJobs(filtered);
}

function toggleJobMenu(index) {
    const menus = document.querySelectorAll('.job-menu-dropdown');
    menus.forEach((menu, i) => {
        if (i !== index) menu.classList.remove('open');
    });
    const menu = document.getElementById(`job-menu-${index}`);
    if (menu) menu.classList.toggle('open');
}

function closeAllJobMenus() {
    document.querySelectorAll('.job-menu-dropdown').forEach(menu => menu.classList.remove('open'));
}

async function reportJob(jobId) {
    closeAllJobMenus();
    const reason = prompt('Please describe why you are reporting this job listing:');
    if (!reason || !reason.trim()) return;
    
    try {
        try {
            const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
            const stored = getter('user_info');
            var userInfo = stored ? JSON.parse(stored) : null;
        } catch (_) { var userInfo = null; }
        
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
                item_id: jobId,
                item_type: 'job',
                reason: reason.trim(),
                reporter_id: reporterId,
                reporter_email: userInfo?.email || null
            });
        
        if (error) throw error;
        alert('Report submitted successfully. Thank you for helping keep our community safe.');
    } catch (err) {
        console.error('[Jobs] Failed to submit report', err);
        alert('Failed to submit report. Please try again.');
    }
}

function subscribeToProfileUpdates() {
    if (!window.supabaseClient?.channel) return;
    try {
        const channel = window.supabaseClient.channel('jobs_profiles_updates');
        channel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async (payload) => {
                try {
                    await loadJobs();
                } catch (e) {
                    console.warn('[Jobs] reload after profile change failed', e);
                }
            })
            .subscribe();
    } catch (e) {
        console.warn('[Jobs] subscribeToProfileUpdates', e);
    }
}

async function enrichJobsWithProfiles(jobs) {
    try {
        const list = Array.isArray(jobs) ? jobs : [];
        const authorIds = Array.from(new Set(list.map(j => j.author_id).filter(Boolean)));
        if (!authorIds.length || !window.supabaseClient) return list;
        const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('id, display_name, full_name, role, department, institution, avatar_url')
            .in('id', authorIds);
        if (error || !Array.isArray(data)) return list;
        const byId = new Map(data.map(p => [String(p.id), p]));
        return list.map(j => {
            const p = j.author_id ? byId.get(String(j.author_id)) : null;
            if (!p) return j;
            return {
                ...j,
                author_display_name: p.display_name || p.full_name || j.poster_display_name || j.poster_full_name || null,
                author_full_name: p.full_name || null,
                author_role: p.role || null,
                author_department: p.department || null,
                author_institution: p.institution || null,
                author_avatar: p.avatar_url || j.poster_avatar || null,
            };
        });
    } catch (_) {
        return jobs;
    }
}

async function deleteJob(jobId) {
    closeAllJobMenus();
    if (!jobId) return;
    const confirmDelete = window.confirm('Delete this job?');
    if (!confirmDelete) return;
    try {
        if (window.FirebaseAPI && typeof window.FirebaseAPI.deleteJob === 'function') {
            await window.FirebaseAPI.deleteJob(jobId);
        } else if (window.supabaseClient) {
            const { error } = await window.supabaseClient.from('jobs').delete().eq('id', jobId);
            if (error) throw error;
        }
        await loadJobs();
    } catch (err) {
        console.error('[Jobs] deleteJob', err);
        alert('Failed to delete job. Please try again.');
    }
}

async function updateJob(jobId, payload) {
    if (!jobId) throw new Error('Missing job id');
    const profileId = await resolveJobProfileId();
    const normalizedPayload = { ...payload, author_id: payload.author_id || profileId || null };
    if (window.FirebaseAPI?.updateJob) {
        await window.FirebaseAPI.updateJob(jobId, normalizedPayload);
        return;
    }
    if (!window.supabaseClient) throw new Error('No backend available for updates');

    const updatePayload = {
        title: normalizedPayload.title,
        company: normalizedPayload.company,
        location: normalizedPayload.location,
        description: normalizedPayload.description,
        author_id: normalizedPayload.author_id || profileId || null,
        metadata: normalizedPayload.metadata,
    };

    const { error } = await window.supabaseClient
        .from('jobs')
        .update(updatePayload)
        .eq('id', jobId);
    if (error) throw error;
}

function resetJobForm(form) {
    if (!form) return;
    form.reset();
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Post Job';
}

function populateJobForm(form, job) {
    if (!form || !job) return;
    const meta = job.metadata || {};
    const setValue = (selector, value) => {
        const el = form.querySelector(selector);
        if (!el) return;
        if ('value' in el) el.value = value || '';
        else el.setAttribute('value', value || '');
    };

    setValue('[name="title"]', job.title);
    setValue('[name="company"]', job.company);
    setValue('[name="location"]', job.location);
    const descEl = form.querySelector('[name="description"]');
    if (descEl) descEl.value = job.description || '';
    setValue('[name="job_type"]', meta.job_type || job.job_type);
    setValue('[name="department"]', meta.department || job.department);
    const skillsEl = form.querySelector('[name="required_skills"]');
    if (skillsEl) skillsEl.value = meta.required_skills || job.required_skills || '';
    setValue('[name="application_url"]', meta.application_url);
    setValue('[name="company_contact"]', meta.company_contact);
}

async function ensureJobProfileExists() {
    if (!window.supabaseClient || !currentUser) return null;
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
        console.error('[Jobs] ensureJobProfileExists failed', err);
        return null;
    }
}

function editJob(jobId) {
    const modal = document.getElementById('post-job-modal');
    const jobForm = document.getElementById('post-job-form');
    if (!jobForm || !modal) return;
    const job = (allJobs || []).find(j => String(j.id) === String(jobId));
    if (!job) return;
    editingJobId = jobId;
    populateJobForm(jobForm, job);
    const submitBtn = jobForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Update Job';
    modal.style.display = 'flex';
}

async function shareJob(jobId) {
    try {
        const url = window.location.href.split('#')[0];
        const shareUrl = `${url}#job-${jobId}`;
        if (navigator.share) {
            await navigator.share({ title: 'Job Opportunity', url: shareUrl });
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            alert('Link copied to clipboard');
        } else {
            alert('Share is not supported in this browser');
        }
    } catch (err) {
        console.error('[Jobs] shareJob', err);
        alert('Failed to share this job.');
    }
}

function openJobDetails(jobId) {
    const modal = document.getElementById('job-detail-modal');
    const body = document.getElementById('job-detail-body');
    if (!modal || !body) return;

    const job = (allJobs || []).find(j => String(j.id) === String(jobId));
    if (!job) return;

    const meta = job.metadata || {};
    const postedAtText = job.created_at ? formatDate(job.created_at) : '';
    const skills = meta.required_skills ? meta.required_skills.split(',').map(s => s.trim()).filter(Boolean) : [];
    const applicationUrl = meta.application_url || '';
    const companyContact = meta.company_contact || '';
    const department = meta.department || job.department || '';
    const jobType = meta.job_type || job.job_type || '';
    const jobTypeKey = jobType ? jobType.toLowerCase().replace(/\s+/g, '-') : '';
    const jobTypeClass = jobTypeKey ? `${jobTypeKey}-badge` : '';
    let posterName = meta.poster_name || '';
    const posterEmail = meta.poster_email || '';
    // Render-time fallback: if poster_name looks like an email, prefer a nicer display
    const looksLikeEmail = (str) => /.+@.+\..+/.test(String(str || ''));
    if (!posterName || looksLikeEmail(posterName)) {
        const profileName = meta.profile_name || meta.full_name || meta.display_name || '';
        posterName = profileName || posterEmail || posterName || 'User';
    }

    body.innerHTML = `
        <div class="job-detail-header">
            <div>
                <div class="job-detail-title">${escapeHtml(job.title || '')}</div>
                <div class="job-detail-subtitle">
                    <span class="job-company">${escapeHtml(job.company || '')}</span>
                    ${jobType ? `<span class="type-badge ${jobTypeClass}">${escapeHtml(jobType)}</span>` : ''}
                </div>
                <div class="job-detail-meta">
                    ${job.location ? `<span>${escapeHtml(job.location)}</span>` : ''}
                    ${department ? `<span>${escapeHtml(department)}</span>` : ''}
                    ${postedAtText ? `<span>${escapeHtml(postedAtText)}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="job-detail-section">
            <h4>Description</h4>
            <p>${escapeHtml(job.description || '')}</p>
        </div>
        ${skills.length ? `
        <div class="job-detail-section">
            <h4>Required Skills</h4>
            <div class="job-detail-skills">
                ${skills.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('')}
            </div>
        </div>` : ''}
        <div class="job-detail-section">
            <h4>Application</h4>
            ${applicationUrl ? `<a class="apply-link" href="${escapeHtml(applicationUrl)}" target="_blank" rel="noopener">Apply via provided link</a>` : '<span>No link provided.</span>'}
        </div>
        <div class="job-detail-section">
            <h4>Company Contact</h4>
            ${companyContact ? `<p>${escapeHtml(companyContact)}</p>` : '<span>Not provided.</span>'}
        </div>
        <div class="job-detail-section">
            <h4>Posted By</h4>
            <div class="job-detail-poster">
                <div>
                    <div class="job-poster-name">${escapeHtml(posterName)}</div>
                    ${posterEmail ? `<div class="job-poster-email">${escapeHtml(posterEmail)}</div>` : ''}
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeJobDetails() {
    const modal = document.getElementById('job-detail-modal');
    if (modal) modal.style.display = 'none';
}

async function hydrateSavedJobs() {
    try {
        const getter = window?.safeLocal?.getItem || (k => { try { return localStorage.getItem(k); } catch (_) { return null; } });
        const raw = getter('saved_jobs');
        const arr = raw ? JSON.parse(raw) : [];
        savedJobIds = new Set((arr || []).map(id => String(id)));
    } catch (_) {
        savedJobIds = new Set();
    }

    const profileId = await getCurrentProfileIdAsync();
    if (!profileId || !window.supabaseClient) return;

    try {
        const { data, error } = await window.supabaseClient
            .from('saved_items')
            .select('item_id')
            .eq('profile_id', profileId)
            .eq('item_type', JOB_ITEM_TYPE);
        if (!error && Array.isArray(data)) {
            savedJobIds = new Set(data.map(row => String(row.item_id)));
            persistSavedJobs();
        }
    } catch (err) {
        console.warn('[Jobs] hydrateSavedJobs supabase', err);
    }
}

function persistSavedJobs() {
    try {
        const setter = window?.safeLocal?.setItem || ((k, v) => { try { localStorage.setItem(k, v); } catch (_) {} });
        setter('saved_jobs', JSON.stringify(Array.from(savedJobIds)));
    } catch (_) {}
}

async function toggleSave(jobId) {
    if (!jobId) return;
    const id = String(jobId);
    const profileId = await getCurrentProfileIdAsync();

    if (!profileId) {
        alert('Please sign in to save jobs.');
        try { if (window.signInWithGoogle) await window.signInWithGoogle(); } catch (_) {}
        return;
    }

    const profileReady = await ensureProfileExists(profileId);
    // If we cannot verify profile due to RLS/conflict, continue with local-only save

    const wasSaved = savedJobIds.has(id);

    if (wasSaved) {
        savedJobIds.delete(id);
    } else {
        savedJobIds.add(id);
    }
    persistSavedJobs();
    refreshSaveButtons(id);

    if (!window.supabaseClient) {
        const savedActive = document.getElementById('saved-filter-toggle')?.classList.contains('active');
        if (savedActive) filterJobs();
        return;
    }

    try {
        if (wasSaved) {
            const rpc = await window.supabaseClient.rpc('saved_items_delete', { p_profile_id: profileId, p_item_id: id, p_item_type: JOB_ITEM_TYPE });
            if (rpc.error) throw rpc.error;
        } else {
            const rpc = await window.supabaseClient.rpc('saved_items_upsert', { p_profile_id: profileId, p_item_id: id, p_item_type: JOB_ITEM_TYPE });
            if (rpc.error) throw rpc.error;
        }
    } catch (err) {
        console.warn('[Jobs] toggleSave RPC failed; attempting direct table write', err);
        try {
            if (wasSaved) {
                const { error } = await window.supabaseClient
                    .from('saved_items')
                    .delete()
                    .eq('profile_id', profileId)
                    .eq('item_id', id)
                    .eq('item_type', JOB_ITEM_TYPE);
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient
                    .from('saved_items')
                    .upsert({ profile_id: profileId, item_id: id, item_type: JOB_ITEM_TYPE });
                if (error) throw error;
            }
        } catch (e2) {
            console.warn('[Jobs] toggleSave direct table write failed (local-only)', e2);
            // Keep local saved state; suppress alerts under RLS
        }
    }

    const savedActive = document.getElementById('saved-filter-toggle')?.classList.contains('active');
    if (savedActive) filterJobs();
}

function refreshSaveButtons(id) {
    const buttons = document.querySelectorAll(`.save-btn[onclick*="${id}"]`);
    buttons.forEach(btn => {
        const nowSaved = savedJobIds.has(id);
        if (nowSaved) {
            btn.classList.add('saved');
            btn.textContent = 'Saved';
        } else {
            btn.classList.remove('saved');
            btn.textContent = 'Save';
        }
    });
}

function getCurrentProfileId() {
    return currentUser?.profile_id || currentUser?.profileId || currentUser?.profile?.id || null;
}

async function getCurrentProfileIdAsync() {
    const existing = getCurrentProfileId();
    if (existing) return existing;

    if (window.supabaseClient?.auth?.getSession) {
        try {
            const { data, error } = await window.supabaseClient.auth.getSession();
            if (!error && data?.session?.user?.id) {
                const uid = data.session.user.id;
                // Resolve the actual profile.id using auth_id
                try {
                    const { data: prof, error: perr } = await window.supabaseClient
                        .from('profiles')
                        .select('id')
                        .eq('auth_id', uid)
                        .maybeSingle();
                    if (!perr && prof?.id) {
                        currentUser = { ...(currentUser || {}), profile_id: prof.id, email: data.session.user.email };
                        return prof.id;
                    }
                } catch (_) {}
                return null;
            }
        } catch (err) {
            console.warn('[Jobs] getCurrentProfileIdAsync', err);
        }
    }
    return null;
}

async function ensureProfileExists(profileId) {
    if (!profileId || !window.supabaseClient) return false;
    try {
        const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', profileId)
            .limit(1)
            .maybeSingle();
        if (!error && data?.id) return true;
    } catch (err) {
        console.warn('[Jobs] ensureProfileExists select', err);
    }
    try {
        const { error } = await window.supabaseClient
            .from('profiles')
            .upsert({ id: profileId, email: currentUser?.email || null, full_name: currentUser?.name || currentUser?.displayName || currentUser?.email || null }, { onConflict: 'id' });
        if (error) {
            const msg = String(error.message || '').toLowerCase();
            if (msg.includes('conflict') || msg.includes('duplicate') || error.code === '23505') {
                // Treat conflict as success; profile exists
                return true;
            }
        }
        return !error;
    } catch (err) {
        console.warn('[Jobs] ensureProfileExists upsert', err);
        // Assume profile exists to allow local-only save
        return true;
    }
}

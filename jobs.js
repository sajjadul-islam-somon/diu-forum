const supabase = window.supabaseClient || null;
let currentUser = null;
let allJobs = [];

// Initialize page
window.addEventListener('load', async () => {
    try {
        const stored = localStorage.getItem('user_info');
        currentUser = stored ? JSON.parse(stored) : null;
    } catch (e) {}
    await loadJobs();
    wireUI();
});

// Helper to show loading
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
        } else if (supabase) {
            const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            jobs = data || [];
        }
        allJobs = jobs;
        displayJobs(jobs);
    } catch (err) {
        console.error('[Jobs] loadJobs', err);
        showError('Failed to load job opportunities. Please refresh the page and try again.');
    }
}

function displayJobs(jobs) {
    const container = document.getElementById('jobs-container');
    if (!container) return;
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<p>No job opportunities found.</p>';
        document.getElementById('results-count') && (document.getElementById('results-count').textContent = 'Showing 0 of 0 opportunities');
        return;
    }

    container.innerHTML = jobs.map((job, index) => {
        const maxLength = 150;
        const meta = job.metadata || {};
        const desc = job.description || meta.description || '';
        const isLong = desc.length > maxLength;
        const shortDesc = isLong ? desc.substring(0, maxLength) + '...' : desc;
        const postedByName = job.poster_name || meta.poster_name || job.poster || job.posted_by || job.posterName || (job.user_type ? job.user_type : 'User');
        const postedAt = job.posted_at || job.created_at || job.postedAt || '';
        const postedAtText = postedAt ? formatDate(postedAt) : '';

        return `
            <div class="job-card">
                <div class="job-header">
                    <div>
                        <div class="job-title">${escapeHtml(job.title)}</div>
                        <div class="job-meta">
                            <span>🏢 ${escapeHtml(job.company || '')}</span>
                            <span>📍 ${escapeHtml(job.location || '')}</span>
                            <span>⏰ ${escapeHtml(postedAtText)}</span>
                        </div>
                    </div>
                    <span class="type-badge ${escapeHtml(meta.job_type || job.job_type || '')}-badge">${escapeHtml(meta.job_type || job.job_type || '')}</span>
                </div>
                <div class="job-description">
                    <div id="desc-short-${index}" ${isLong ? '' : 'style="display:none;"'}>
                        ${escapeHtml(shortDesc)}
                        ${isLong ? `<br><button class="show-more-btn" onclick="toggleDescription(${index})">Show more</button>` : ''}
                    </div>
                    <div id="desc-full-${index}" style="display:none;">
                        ${escapeHtml(desc)}
                        ${isLong ? `<br><button class="show-more-btn" onclick="toggleDescription(${index})">Show less</button>` : ''}
                    </div>
                </div>
                ${((meta.required_skills || job.required_skills) ? `
                    <div class="job-skills">
                        ${( (meta.required_skills || job.required_skills).split(',').map(s => `<span class="skill-tag">${escapeHtml(s.trim())}</span>`).join(''))}
                    </div>
                ` : '')}
                <div class="job-footer">
                    <div class="job-poster">Posted by ${escapeHtml(postedByName)}</div>
                    <div class="job-actions">
                        <button class="save-btn">Save</button>
                        ${((meta.application_url || job.application_url) ? `<button class="apply-btn" onclick="window.open('${escapeHtml(meta.application_url || job.application_url)}', '_blank')">Apply Now</button>` : `<button class="apply-btn">Apply Now</button>`)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('results-count') && (document.getElementById('results-count').textContent = `Showing ${jobs.length} of ${jobs.length} opportunities`);
}

function toggleDescription(index) {
    const shortDiv = document.getElementById(`desc-short-${index}`);
    const fullDiv = document.getElementById(`desc-full-${index}`);
    if (!shortDiv || !fullDiv) return;
    if (shortDiv.style.display === 'none') {
        shortDiv.style.display = 'block';
        fullDiv.style.display = 'none';
    } else {
        shortDiv.style.display = 'none';
        fullDiv.style.display = 'block';
    }
}

function formatDate(dateString) {
    try {
        const d = new Date(dateString);
        const now = new Date();
        const diff = Math.abs(now - d);
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days === 1) return '1 day ago';
        if (days < 7) return `${days} days ago`;
        if (days < 30) return `${Math.ceil(days / 7)} weeks ago`;
        return d.toLocaleDateString();
    } catch (e) { return ''; }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, s => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[s]);
}

function wireUI() {
    const modal = document.getElementById('post-job-modal');
    const postJobBtn = document.getElementById('post-job-btn');
    const closeModal = document.getElementById('close-modal');
    const cancelPost = document.getElementById('cancel-post');

    if (postJobBtn) {
        postJobBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const stored = localStorage.getItem('user_info');
            if (!stored) {
                // trigger sign in
                try { await window.signInWithGoogle?.(); } catch (err) { console.warn('Sign in failed', err); return; }
            }
            if (modal) modal.style.display = 'block';
        });
    }

    if (closeModal) closeModal.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    if (cancelPost) cancelPost.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });

    const jobForm = document.getElementById('post-job-form');
    if (jobForm) {
        jobForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const stored = localStorage.getItem('user_info');
                currentUser = stored ? JSON.parse(stored) : null;
            } catch (err) { currentUser = null; }
            if (!currentUser) { alert('Please sign in to post a job'); return; }

            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.textContent = 'Posting Job...'; submitBtn.disabled = true; }

            const formData = new FormData(e.target);
            const payload = {
                title: formData.get('title'),
                company: formData.get('company'),
                location: formData.get('location'),
                description: formData.get('description'),
                metadata: {
                    job_type: formData.get('job_type'),
                    department: formData.get('department'),
                    required_skills: formData.get('required_skills'),
                    application_url: formData.get('application_url'),
                    poster_name: currentUser?.name || currentUser?.email || currentUser?.displayName || null,
                    poster_auth_id: currentUser?.id || null
                }
            };

            try {
                let created;
                if (window.FirebaseAPI && typeof window.FirebaseAPI.createJob === 'function') {
                    created = await window.FirebaseAPI.createJob(payload);
                } else if (supabase) {
                    const { data, error } = await supabase.from('jobs').insert([payload]).select().single();
                    if (error) throw error;
                    created = data;
                }
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

    // Wire search/filter inputs
    const searchInput = document.getElementById('search-input');
    const deptSelect = document.getElementById('department-filter');
    const typeSelect = document.getElementById('type-filter');
    if (searchInput) searchInput.addEventListener('input', filterJobs);
    if (deptSelect) deptSelect.addEventListener('change', filterJobs);
    if (typeSelect) typeSelect.addEventListener('change', filterJobs);
}

function filterJobs() {
    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    const departmentFilter = document.getElementById('department-filter')?.value || '';
    const typeFilter = document.getElementById('type-filter')?.value || '';

    const filtered = (allJobs || []).filter(job => {
        const title = (job.title || '').toLowerCase();
        const company = (job.company || '').toLowerCase();
        const meta = job.metadata || {};
        const desc = (job.description || meta.description || '').toLowerCase();
        const skills = (meta.required_skills || job.required_skills || '').toLowerCase();
        const matchesSearch = !searchTerm || title.includes(searchTerm) || company.includes(searchTerm) || desc.includes(searchTerm) || skills.includes(searchTerm);
        const matchesDept = !departmentFilter || (job.department === departmentFilter) || (meta.department === departmentFilter);
        const matchesType = !typeFilter || (meta.job_type === typeFilter) || (job.job_type === typeFilter);
        return matchesSearch && matchesDept && matchesType;
    });
    displayJobs(filtered);
}


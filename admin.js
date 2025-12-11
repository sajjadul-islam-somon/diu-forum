console.log('[Admin] Script loaded');

// Admin credentials (hardcoded for security through obscurity)
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'nuha1234'
};

// Session management
const SESSION_KEY = 'admin_session';
const SESSION_DURATION = 3600000; // 1 hour

let supabaseClient = null;
let currentTab = 'overview';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    checkSession();
    wireUI();
});

function initSupabase() {
    if (window.supabaseClient) {
        supabaseClient = window.supabaseClient;
    } else if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
}

function checkSession() {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
        try {
            const data = JSON.parse(session);
            if (Date.now() - data.timestamp < SESSION_DURATION) {
                showDashboard();
                return;
            }
        } catch (e) {
            console.error('Invalid session', e);
        }
    }
    showLogin();
}

function createSession() {
    const sessionData = {
        timestamp: Date.now(),
        username: ADMIN_CREDENTIALS.username
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-dashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'flex';
    loadDashboardData();
}

function wireUI() {
    // Login form
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });

    // Report filters
    const reportStatusFilter = document.getElementById('report-status-filter');
    const reportTypeFilter = document.getElementById('report-type-filter');
    if (reportStatusFilter) reportStatusFilter.addEventListener('change', loadReports);
    if (reportTypeFilter) reportTypeFilter.addEventListener('change', loadReports);

    // Content filters
    const contentTypeFilter = document.getElementById('content-type-filter');
    const contentSearch = document.getElementById('content-search');
    if (contentTypeFilter) contentTypeFilter.addEventListener('change', loadContent);
    if (contentSearch) contentSearch.addEventListener('input', debounce(loadContent, 500));

    // User search
    const userSearch = document.getElementById('user-search');
    if (userSearch) userSearch.addEventListener('input', debounce(loadUsers, 500));

    // Settings buttons
    const refreshStatsBtn = document.getElementById('refresh-stats-btn');
    const exportReportsBtn = document.getElementById('export-reports-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');

    if (refreshStatsBtn) refreshStatsBtn.addEventListener('click', loadStats);
    if (exportReportsBtn) exportReportsBtn.addEventListener('click', exportReports);
    if (clearCacheBtn) clearCacheBtn.addEventListener('click', clearCache);

    // Modal close
    document.querySelectorAll('.modal-close, #confirm-cancel').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        createSession();
        errorEl.classList.remove('show');
        showDashboard();
    } else {
        errorEl.textContent = 'Invalid username or password';
        errorEl.classList.add('show');
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        clearSession();
        showLogin();
    }
}

function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Load tab-specific data
    switch (tabName) {
        case 'overview':
            loadStats();
            loadRecentActivity();
            break;
        case 'reports':
            loadReports();
            break;
        case 'content':
            loadContent();
            break;
        case 'users':
            loadUsers();
            break;
    }
}

async function loadDashboardData() {
    loadStats();
    loadRecentActivity();
    if (currentTab === 'reports') loadReports();
}

async function loadStats() {
    if (!supabaseClient) return;

    try {
        // Load posts count
        const { count: postsCount } = await supabaseClient
            .from('posts')
            .select('*', { count: 'exact', head: true });
        document.getElementById('stat-posts').textContent = postsCount || 0;

        // Load jobs count
        const { count: jobsCount } = await supabaseClient
            .from('jobs')
            .select('*', { count: 'exact', head: true });
        document.getElementById('stat-jobs').textContent = jobsCount || 0;

        // Load studies count
        const { count: studiesCount } = await supabaseClient
            .from('education_opportunities')
            .select('*', { count: 'exact', head: true });
        document.getElementById('stat-studies').textContent = studiesCount || 0;

        // Load users count
        const { count: usersCount } = await supabaseClient
            .from('profiles')
            .select('*', { count: 'exact', head: true });
        document.getElementById('stat-users').textContent = usersCount || 0;

        // Load pending reports count
        const { count: reportsCount } = await supabaseClient
            .from('reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        document.getElementById('stat-reports').textContent = reportsCount || 0;

    } catch (err) {
        console.error('Failed to load stats', err);
    }
}

async function loadRecentActivity() {
    const container = document.getElementById('recent-activity-list');
    if (!supabaseClient || !container) return;

    container.innerHTML = '<p class="loading">Loading activity...</p>';

    try {
        // Get recent posts
        const { data: recentPosts } = await supabaseClient
            .from('posts')
            .select('id, heading, posted_at, author_name')
            .order('posted_at', { ascending: false })
            .limit(5);

        // Get recent jobs
        const { data: recentJobs } = await supabaseClient
            .from('jobs')
            .select('id, title, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        // Get recent studies
        const { data: recentStudies } = await supabaseClient
            .from('education_opportunities')
            .select('id, title, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        // Combine and sort
        const activities = [
            ...(recentPosts || []).map(p => ({ type: 'post', data: p, time: p.posted_at })),
            ...(recentJobs || []).map(j => ({ type: 'job', data: j, time: j.created_at })),
            ...(recentStudies || []).map(s => ({ type: 'study', data: s, time: s.created_at }))
        ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);

        if (activities.length === 0) {
            container.innerHTML = '<p class="empty-state">No recent activity</p>';
            return;
        }

        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-info">
                    <div class="activity-type">${getActivityTypeLabel(activity.type)}</div>
                    <div class="activity-description">${escapeHtml(getActivityTitle(activity))}</div>
                </div>
                <div class="activity-time">${formatTimeAgo(activity.time)}</div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load recent activity', err);
        container.innerHTML = '<p class="empty-state">Failed to load activity</p>';
    }
}

async function loadReports() {
    const container = document.getElementById('reports-list');
    if (!supabaseClient || !container) return;

    container.innerHTML = '<p class="loading">Loading reports...</p>';

    try {
        const statusFilter = document.getElementById('report-status-filter').value;
        const typeFilter = document.getElementById('report-type-filter').value;

        let query = supabaseClient
            .from('reports')
            .select('*')
            .order('created_at', { ascending: false });

        if (statusFilter) query = query.eq('status', statusFilter);
        if (typeFilter) query = query.eq('item_type', typeFilter);

        const { data: reports, error } = await query;

        if (error) throw error;

        if (!reports || reports.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No reports found</p></div>';
            return;
        }

        container.innerHTML = reports.map(report => `
            <div class="report-item" data-id="${report.id}">
                <div class="report-header">
                    <div class="report-title">Report #${report.id.substring(0, 8)}</div>
                </div>
                <div class="report-meta">
                    <span class="meta-badge badge-${report.status}">${report.status}</span>
                    <span class="meta-badge badge-${report.item_type}">${report.item_type}</span>
                    <span>${formatTimeAgo(report.created_at)}</span>
                </div>
                <div class="report-reason">${escapeHtml(report.reason || 'No reason provided')}</div>
                <div class="report-actions">
                    <button class="btn-action" onclick="viewReportedContent('${report.item_id}', '${report.item_type}')">View Content</button>
                    <button class="btn-danger" onclick="deleteReportedContent('${report.item_id}', '${report.item_type}', '${report.id}')">Delete Content</button>
                    <button class="btn-success" onclick="resolveReport('${report.id}')">Resolve</button>
                    <button class="btn-secondary" onclick="dismissReport('${report.id}')">Dismiss</button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load reports', err);
        container.innerHTML = '<p class="empty-state">Failed to load reports</p>';
    }
}

async function loadContent() {
    const container = document.getElementById('content-list');
    if (!supabaseClient || !container) return;

    container.innerHTML = '<p class="loading">Loading content...</p>';

    try {
        const contentType = document.getElementById('content-type-filter').value;
        const searchTerm = document.getElementById('content-search').value.toLowerCase();

        let query = supabaseClient
            .from(contentType)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        const { data: content, error } = await query;

        if (error) throw error;

        let filteredContent = content || [];
        if (searchTerm) {
            filteredContent = filteredContent.filter(item => {
                const title = (item.title || item.heading || '').toLowerCase();
                const description = (item.description || item.content || '').toLowerCase();
                return title.includes(searchTerm) || description.includes(searchTerm);
            });
        }

        if (filteredContent.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><p>No content found</p></div>';
            return;
        }

        container.innerHTML = filteredContent.map(item => `
            <div class="content-item" data-id="${item.id}">
                <div class="content-header">
                    <div class="content-title">${escapeHtml(item.title || item.heading || 'Untitled')}</div>
                </div>
                <div class="content-meta">
                    <span class="meta-badge badge-${contentType === 'posts' ? 'post' : contentType === 'jobs' ? 'job' : 'study'}">${contentType}</span>
                    <span>${formatTimeAgo(item.created_at || item.posted_at)}</span>
                </div>
                <div class="content-description">${escapeHtml(truncate(item.description || item.content || '', 150))}</div>
                <div class="content-actions">
                    <button class="btn-action" onclick="viewContentDetail('${item.id}', '${contentType}')">View Details</button>
                    <button class="btn-danger" onclick="deleteContent('${item.id}', '${contentType}')">Delete</button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load content', err);
        container.innerHTML = '<p class="empty-state">Failed to load content</p>';
    }
}

async function loadUsers() {
    const container = document.getElementById('users-list');
    if (!supabaseClient || !container) return;

    container.innerHTML = '<p class="loading">Loading users...</p>';

    try {
        const searchTerm = document.getElementById('user-search').value.toLowerCase();

        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        let filteredUsers = users || [];
        if (searchTerm) {
            filteredUsers = filteredUsers.filter(user => {
                const name = (user.full_name || user.display_name || '').toLowerCase();
                const email = (user.email || '').toLowerCase();
                return name.includes(searchTerm) || email.includes(searchTerm);
            });
        }

        if (filteredUsers.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No users found</p></div>';
            return;
        }

        container.innerHTML = filteredUsers.map(user => `
            <div class="user-item" data-id="${user.id}">
                <div class="user-header">
                    <div class="user-name">${escapeHtml(user.full_name || user.display_name || 'Unknown User')}</div>
                </div>
                <div class="user-meta">
                    <span>${escapeHtml(user.email || 'No email')}</span>
                    <span>${escapeHtml(user.role || 'No role')}</span>
                    <span>${escapeHtml(user.department || 'No department')}</span>
                </div>
                <div class="user-actions">
                    <button class="btn-action" onclick="viewUserDetails('${user.id}')">View Profile</button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load users', err);
        container.innerHTML = '<p class="empty-state">Failed to load users</p>';
    }
}

// Content actions
window.viewReportedContent = async function(itemId, itemType) {
    const tableName = itemType === 'post' ? 'posts' : itemType === 'job' ? 'jobs' : 'education_opportunities';
    const { data, error } = await supabaseClient.from(tableName).select('*').eq('id', itemId).single();
    
    if (error || !data) {
        alert('Failed to load content');
        return;
    }

    showDetailModal(data, itemType);
};

window.deleteReportedContent = async function(itemId, itemType, reportId) {
    if (!await confirmAction('Delete Content', 'Are you sure you want to delete this content? This action cannot be undone.')) {
        return;
    }

    const tableName = itemType === 'post' ? 'posts' : itemType === 'job' ? 'jobs' : 'education_opportunities';
    const { error } = await supabaseClient.from(tableName).delete().eq('id', itemId);

    if (error) {
        alert('Failed to delete content: ' + error.message);
        return;
    }

    // Mark report as resolved
    await supabaseClient.from('reports').update({ status: 'resolved' }).eq('id', reportId);

    alert('Content deleted successfully');
    loadReports();
    loadStats();
};

window.resolveReport = async function(reportId) {
    const { error } = await supabaseClient.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    
    if (error) {
        alert('Failed to resolve report');
        return;
    }

    loadReports();
    loadStats();
};

window.dismissReport = async function(reportId) {
    const { error } = await supabaseClient.from('reports').update({ status: 'dismissed' }).eq('id', reportId);
    
    if (error) {
        alert('Failed to dismiss report');
        return;
    }

    loadReports();
    loadStats();
};

window.deleteContent = async function(itemId, contentType) {
    if (!await confirmAction('Delete Content', 'Are you sure you want to delete this item? This action cannot be undone.')) {
        return;
    }

    const { error } = await supabaseClient.from(contentType).delete().eq('id', itemId);

    if (error) {
        alert('Failed to delete content: ' + error.message);
        return;
    }

    alert('Content deleted successfully');
    loadContent();
    loadStats();
};

window.viewContentDetail = async function(itemId, contentType) {
    const { data, error } = await supabaseClient.from(contentType).select('*').eq('id', itemId).single();
    
    if (error || !data) {
        alert('Failed to load content details');
        return;
    }

    const type = contentType === 'posts' ? 'post' : contentType === 'jobs' ? 'job' : 'study';
    showDetailModal(data, type);
};

window.viewUserDetails = async function(userId) {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    
    if (error || !data) {
        alert('Failed to load user details');
        return;
    }

    showDetailModal(data, 'user');
};

function showDetailModal(data, type) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('detail-content');

    let html = '';
    if (type === 'post') {
        html = `
            <h2>${escapeHtml(data.heading || 'Untitled Post')}</h2>
            <p><strong>Author:</strong> ${escapeHtml(data.author_name || 'Unknown')}</p>
            <p><strong>Posted:</strong> ${formatDate(data.posted_at)}</p>
            <div style="margin-top: 1rem; padding: 1rem; background: #f8fafc; border-radius: 8px;">
                ${escapeHtml(data.content || 'No content')}
            </div>
        `;
    } else if (type === 'job') {
        html = `
            <h2>${escapeHtml(data.title || 'Untitled Job')}</h2>
            <p><strong>Company:</strong> ${escapeHtml(data.company || 'N/A')}</p>
            <p><strong>Location:</strong> ${escapeHtml(data.location || 'N/A')}</p>
            <p><strong>Posted:</strong> ${formatDate(data.created_at)}</p>
            <div style="margin-top: 1rem;">
                <strong>Description:</strong>
                <p>${escapeHtml(data.description || 'No description')}</p>
            </div>
        `;
    } else if (type === 'study') {
        html = `
            <h2>${escapeHtml(data.title || 'Untitled Opportunity')}</h2>
            <p><strong>University:</strong> ${escapeHtml(data.university || data.provider || 'N/A')}</p>
            <p><strong>Country:</strong> ${escapeHtml(data.country || 'N/A')}</p>
            <p><strong>Type:</strong> ${escapeHtml(data.opportunity_type || 'N/A')}</p>
            <p><strong>Posted:</strong> ${formatDate(data.created_at)}</p>
            <div style="margin-top: 1rem;">
                <strong>Description:</strong>
                <p>${escapeHtml(data.description || 'No description')}</p>
            </div>
        `;
    } else if (type === 'user') {
        html = `
            <h2>${escapeHtml(data.full_name || data.display_name || 'Unknown User')}</h2>
            <p><strong>Email:</strong> ${escapeHtml(data.email || 'N/A')}</p>
            <p><strong>Role:</strong> ${escapeHtml(data.role || 'N/A')}</p>
            <p><strong>Department:</strong> ${escapeHtml(data.department || 'N/A')}</p>
            <p><strong>Institution:</strong> ${escapeHtml(data.institution || 'N/A')}</p>
            <p><strong>Joined:</strong> ${formatDate(data.created_at)}</p>
        `;
    }

    content.innerHTML = html;
    modal.classList.add('show');
}

function confirmAction(title, message) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        
        modal.classList.add('show');

        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        const cleanup = () => {
            modal.classList.remove('show');
            okBtn.replaceWith(okBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        };

        document.getElementById('confirm-ok').onclick = () => {
            cleanup();
            resolve(true);
        };

        document.getElementById('confirm-cancel').onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
}

function exportReports() {
    alert('Export functionality coming soon');
}

function clearCache() {
    if (confirm('Clear all cached data?')) {
        localStorage.removeItem('saved_jobs');
        localStorage.removeItem('saved_studies');
        alert('Cache cleared');
    }
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m]));
}

function truncate(str, len) {
    if (!str || str.length <= len) return str;
    return str.substring(0, len) + '...';
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return 'Unknown';
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    return formatDate(dateStr);
}

function getActivityTypeLabel(type) {
    const labels = {
        post: '📝 New Blog Post',
        job: '💼 New Job Listing',
        study: '🎓 New Study Opportunity'
    };
    return labels[type] || type;
}

function getActivityTitle(activity) {
    if (activity.type === 'post') {
        return activity.data.heading || 'Untitled';
    }
    return activity.data.title || 'Untitled';
}

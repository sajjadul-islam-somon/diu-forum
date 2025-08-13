let currentUser = null;
let allJobs = []; // Store all jobs for filtering
let authInitialized = false;

// Check authentication on page load
window.onload = function() {
    // Don't redirect to login - let users browse freely
    //checkAuthentication();
    // Initialize current user from localStorage for posting
    try {
        const storedUser = localStorage.getItem('user_info');
        currentUser = storedUser ? JSON.parse(storedUser) : null;
    } catch {}
    loadJobs();
};

// Keep currentUser in sync if other scripts update localStorage (e.g., auth.js)
window.addEventListener('storage', (e) => {
    if (e.key === 'user_info') {
        try { currentUser = e.newValue ? JSON.parse(e.newValue) : null; } catch {}
    }
});

// Check if user is authenticated
function checkAuthentication() {
    const storedUser = localStorage.getItem('user_info');
    const credential = localStorage.getItem('google_credential');
    
    if (storedUser && credential) {
        currentUser = JSON.parse(storedUser);
        authInitialized = true;
        document.getElementById('post-job-btn').style.display = 'flex';
        updateHeaderWithUser(currentUser);
    } else {
        // No authentication - show post button but it will trigger login
        document.getElementById('post-job-btn').style.display = 'flex';
        document.getElementById('post-job-btn').innerHTML = '<span>+</span> Post Job (Sign in required)';
    }
}

// Show loading state
function showLoading() {
    document.getElementById('jobs-container').innerHTML = '<p>Loading job opportunities...</p>';
}

// Update header with user information
function updateHeaderWithUser(user) {
    const headerContent = document.querySelector('.header-content');
    if (headerContent && !document.getElementById('user-info')) {
        const userInfo = document.createElement('div');
        userInfo.id = 'user-info';
        userInfo.style.cssText = 'margin-top: 10px; font-size: 14px; opacity: 0.8;';
        userInfo.innerHTML = `
            Welcome back, ${user.displayName || user.email}! 
            <button onclick="logoutUser()" style="margin-left: 10px; padding: 5px 10px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer;">Sign Out</button>
        `;
        headerContent.appendChild(userInfo);
    }
}

// Logout function
window.logoutUser = function() {
    // Clear local storage
    localStorage.removeItem('google_credential');
    localStorage.removeItem('user_info');
    
    // Redirect to login
    window.location.href = 'login.html';
};

// Modal functionality
const modal = document.getElementById('post-job-modal');
const postJobBtn = document.getElementById('post-job-btn');
postJobBtn.addEventListener('click', async () => {
    const user = localStorage.getItem('user_info');
    if (!user) {
        // Use Google sign-in popup instead of redirect
        try {
            await window.diuAuth.signInWithGoogle();
            // After login, check again
            const newUser = localStorage.getItem('user_info');
            if (!newUser) return; // If still not logged in, do nothing
            try { currentUser = JSON.parse(newUser); } catch {}
        } catch (e) {
            alert('Google sign-in failed. Please try again.');
            return;
        }
    }
    modal.style.display = 'block';
});

const closeModal = document.getElementById('close-modal');
const cancelPost = document.getElementById('cancel-post');

closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

cancelPost.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Post job form submission - ONLY CHANGED THIS PART TO USE FIREBASE
document.getElementById('post-job-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Ensure currentUser is populated from localStorage if available
    if (!currentUser) {
        try {
            const storedUser = localStorage.getItem('user_info');
            currentUser = storedUser ? JSON.parse(storedUser) : null;
        } catch {}
    }
    if (!currentUser) { alert('Please log in to post a job'); return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Posting Job...';
    submitBtn.disabled = true;

    const formData = new FormData(e.target);
    const jobData = {
        title: formData.get('title'),
        company: formData.get('company'),
        location: formData.get('location'),
        job_type: formData.get('job_type'),
        department: formData.get('department'),
        description: formData.get('description'),
        required_skills: formData.get('required_skills'),
        application_url: formData.get('application_url'),
        firebase_uid: currentUser.uid, // Google ID
        poster_name: currentUser.displayName || currentUser.email,
        user_type: currentUser.user_type || 'User' // Track user type
    };

    try {
        // WITH: FirebaseAPI.createJob(jobData)
        const response = await window.FirebaseAPI.createJob(jobData);
        const result = await response.json();

        if (response.ok) {
            alert('Job posted successfully!');
            modal.style.display = 'none';
            e.target.reset();
            loadJobs(); // Reload jobs
        } else {
            throw new Error(result.error || 'Failed to post job');
        }
    } catch (error) {
        console.error('Error posting job:', error);
        alert('Failed to post job: ' + error.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Load jobs from backend - ONLY CHANGED THIS PART TO USE FIREBASE
async function loadJobs() {
    showLoading();
    
    try {
        // WITH: FirebaseAPI.getJobs()
        const response = await window.FirebaseAPI.getJobs();
        
        if (!response.ok) {
            throw new Error('Failed to fetch jobs');
        }
        
        const jobs = await response.json();
        allJobs = jobs; // Store for filtering
        displayJobs(jobs);
    } catch (error) {
        console.error('Error loading jobs:', error);
        document.getElementById('jobs-container').innerHTML = 
            '<p>Failed to load job opportunities. Please refresh the page and try again.</p>';
    }
}

// Display jobs - UNCHANGED
function displayJobs(jobs) {
    const container = document.getElementById('jobs-container');
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<p>No job opportunities found.</p>';
        return;
    }

    container.innerHTML = jobs.map((job, index) => {
        const maxLength = 150; // Character limit for preview
        const isLongDescription = job.description.length > maxLength;
        const shortDescription = isLongDescription ? 
            job.description.substring(0, maxLength) + '...' : 
            job.description;
    // Prefer the uploader's name; fallback gracefully
    const postedByName = job.poster_name || job.poster || job.posterName || job.posted_by || (job.user_type ? job.user_type : 'User');
        return `
        <div class="job-card">
            <div class="job-header">
                <div>
                    <div class="job-title">${job.title}</div>
                    <div class="job-meta">
                        <span>🏢 ${job.company}</span>
                        <span>📍 ${job.location}</span>
                        <span>⏰ ${formatDate(job.posted_at)}</span>
                    </div>
                </div>
                <span class="type-badge ${job.job_type}-badge">${job.job_type}</span>
            </div>
            <div class="job-description">
                <div id="desc-short-${index}" ${isLongDescription ? '' : 'style=\"display: none;\"'}>
                    ${shortDescription}
                    ${isLongDescription ? `<br><button class="show-more-btn" onclick="toggleDescription(${index})">Show more</button>` : ''}
                </div>
                <div id="desc-full-${index}" style="display: none;">
                    ${job.description}
                    ${isLongDescription ? `<br><button class="show-more-btn" onclick="toggleDescription(${index})">Show less</button>` : ''}
                </div>
                ${!isLongDescription ? `<div>${job.description}</div>` : ''}
            </div>
            ${job.required_skills ? `
                <div class="job-skills">
                    ${job.required_skills.split(',').map(skill => 
                        `<span class="skill-tag">${skill.trim()}</span>`
                    ).join('')}
                </div>
            ` : ''}
            <div class="job-footer">
                <div class="job-poster">Posted by ${postedByName}</div>
                <div class="job-actions">
                    <button class="save-btn">Save</button>
                    ${job.application_url ? 
                        `<button class="apply-btn" onclick="window.open('${job.application_url}', '_blank')">Apply Now</button>` : 
                        `<button class="apply-btn">Apply Now</button>`
                    }
                </div>
            </div>
        </div>
    `;
    }).join('');

    // Update results count
    document.getElementById('results-count').textContent = `Showing ${jobs.length} of ${jobs.length} opportunities`;
}

// Toggle description function - UNCHANGED
function toggleDescription(index) {
    const shortDiv = document.getElementById(`desc-short-${index}`);
    const fullDiv = document.getElementById(`desc-full-${index}`);
    
    if (shortDiv.style.display === 'none') {
        shortDiv.style.display = 'block';
        fullDiv.style.display = 'none';
    } else {
        shortDiv.style.display = 'none';
        fullDiv.style.display = 'block';
    }
}

// Format date - UNCHANGED
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
}

// Search and filter functionality - UNCHANGED
document.getElementById('search-input').addEventListener('input', filterJobs);
document.getElementById('department-filter').addEventListener('change', filterJobs);
document.getElementById('type-filter').addEventListener('change', filterJobs);

function filterJobs() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const departmentFilter = document.getElementById('department-filter').value;
    const typeFilter = document.getElementById('type-filter').value;

    let filteredJobs = allJobs.filter(job => {
        const matchesSearch = !searchTerm || 
            job.title.toLowerCase().includes(searchTerm) ||
            job.company.toLowerCase().includes(searchTerm) ||
            job.description.toLowerCase().includes(searchTerm) ||
            (job.required_skills && job.required_skills.toLowerCase().includes(searchTerm));

        const matchesDepartment = !departmentFilter || job.department === departmentFilter;
        const matchesType = !typeFilter || job.job_type === typeFilter;

        return matchesSearch && matchesDepartment && matchesType;
    });

    displayJobs(filteredJobs);
}


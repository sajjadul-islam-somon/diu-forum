// JavaScript extracted from education.html
// Using global window.FirebaseAPI provided by firebase-simple.js loaded in the page

let currentUser = null;
let allOpportunities = []; // Store all opportunities for filtering

// Check authentication on page load
window.onload = function() {
    //checkAuthentication();
    try {
        const storedUser = localStorage.getItem('user_info');
        currentUser = storedUser ? JSON.parse(storedUser) : null;
    } catch {}
    loadOpportunities();
};

// Check if user is authenticated
function checkAuthentication() {
    const storedUser = localStorage.getItem('user_info');
    const credential = localStorage.getItem('google_credential');
    
    if (storedUser && credential) {
        currentUser = JSON.parse(storedUser);
        document.getElementById('share-opportunity-btn').style.display = 'flex';
        updateHeaderWithUser(currentUser);
    } else {
        // No authentication found, redirect to login
        setTimeout(() => {
            console.log('No authenticated user, redirecting to login...');
            window.location.href = 'login.html';
        }, 1000);
    }
}

// Show loading state
function showLoading() {
    document.getElementById('opportunities-container').innerHTML = '<p>Loading education opportunities...</p>';
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
const modal = document.getElementById('share-opportunity-modal');
const shareBtn = document.getElementById('share-opportunity-btn');
const closeModal = document.getElementById('close-modal');
const cancelShare = document.getElementById('cancel-share');

shareBtn.addEventListener('click', () => {
    const user = localStorage.getItem('user_info');
    if (!user) {
        // Use Google sign-in popup instead of redirect
        window.diuAuth.signInWithGoogle().then(() => {
            const newUser = localStorage.getItem('user_info');
            if (!newUser) return; // If still not logged in, do nothing
            modal.style.display = 'block';
        }).catch(() => {
            alert('Google sign-in failed. Please try again.');
        });
        return;
    }
    // Show the modal only if logged in
    modal.style.display = 'block';
});

closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

cancelShare.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Share opportunity form submission
document.getElementById('share-opportunity-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Ensure current user is hydrated
    if (!currentUser) {
        try { const s = localStorage.getItem('user_info'); currentUser = s ? JSON.parse(s) : null; } catch {}
    }
    if (!currentUser) { alert('Please log in to share an opportunity'); return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Sharing Opportunity...';
    submitBtn.disabled = true;

    const formData = new FormData(e.target);
    const opportunityData = {
        title: formData.get('title'),
        university: formData.get('university'),
        country: formData.get('country'),
        opportunity_type: formData.get('opportunity_type'),
        funding: formData.get('funding'),
        deadline: formData.get('deadline'),
        description: formData.get('description'),
        requirements: formData.get('requirements'),
        application_url: formData.get('application_url'),
        firebase_uid: currentUser.uid, // Google ID
        poster_name: currentUser.displayName || currentUser.email,
        user_type: currentUser.user_type || 'User'
    };

    try {
        const result = await window.FirebaseAPI.createEducationOpportunity(opportunityData);
        
        alert('Opportunity shared successfully!');
        modal.style.display = 'none';
        e.target.reset();
        loadOpportunities();
    } catch (error) {
        console.error('Error sharing opportunity:', error);
        alert('Failed to share opportunity: ' + error.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Load opportunities from backend
async function loadOpportunities() {
    showLoading();
    try {
        const opportunities = await window.FirebaseAPI.getEducationOpportunities();
        console.log(opportunities); // Debug
        allOpportunities = opportunities;
        displayOpportunities(opportunities);
    } catch (error) {
        console.error('Error loading opportunities:', error);
        document.getElementById('opportunities-container').innerHTML = 
            '<p>Failed to load education opportunities. Please refresh the page and try again.</p>';
    }
}

// Display opportunities
function displayOpportunities(opportunities) {
    const container = document.getElementById('opportunities-container');
    
    if (!opportunities || opportunities.length === 0) {
        container.innerHTML = '<p>No education opportunities found.</p>';
        return;
    }

    container.innerHTML = opportunities.map(opportunity => `
        <div class="opportunity-card">
            ${opportunity.featured ? '<span class="featured-badge">Featured</span>' : ''}
            <div class="type-badges">
                <span class="type-badge ${opportunity.opportunity_type}-badge">${opportunity.opportunity_type}</span>
                <span class="type-badge country-badge">${opportunity.country}</span>
            </div>
            <div class="opportunity-title">${opportunity.title}</div>
            <div class="university-info">
                <span>🎓</span>
                <span>${opportunity.university}</span>
            </div>
            <div class="opportunity-description">
                <span class="description-text">${opportunity.description}</span>
                <button class="see-more-btn" style="display:none;">...see more</button>
            </div>
            <div class="opportunity-details">
                ${opportunity.deadline ? `
                    <div class="detail-item">
                        <span class="detail-label">Deadline</span>
                        <span class="detail-value">${formatDate(opportunity.deadline)}</span>
                    </div>
                ` : ''}
                ${opportunity.funding ? `
                    <div class="detail-item">
                        <span class="detail-label">Funding</span>
                        <span class="detail-value">${opportunity.funding.replace('-', ' ')}</span>
                    </div>
                ` : ''}
            </div>
            ${opportunity.requirements ? `
                <div class="requirements">
                    <h4>Requirements:</h4>
                    <div class="requirement-tags">
                        ${opportunity.requirements.split(',').map(req => 
                            `<span class="requirement-tag">${req.trim()}</span>`
                        ).join('')}
                    </div>
                </div>
            ` : ''}
            <div class="opportunity-footer">
                <div class="opportunity-poster">Posted by ${opportunity.poster_name || 'Alumni'}</div>
                <div class="opportunity-actions">
                    <button class="save-btn">Save</button>
                    ${opportunity.application_url ? 
                        `<button class="apply-btn" onclick="window.open('${opportunity.application_url}', '_blank')">Apply</button>` : 
                        `<button class="apply-btn">Apply</button>`
                    }
                </div>
            </div>
        </div>
    `).join('');

    // Update results count
    const totalCount = allOpportunities ? allOpportunities.length : opportunities.length;
    const isFiltered = allOpportunities && opportunities.length !== totalCount;
    const countMessage = isFiltered ? 
        `Showing ${opportunities.length} of ${totalCount} opportunities` : 
        `Showing ${opportunities.length} opportunities`;
    document.getElementById('results-count').textContent = countMessage;

    setTimeout(function() {
        document.querySelectorAll('.opportunity-description').forEach(function(desc) {
            const textSpan = desc.querySelector('.description-text');
            const btn = desc.querySelector('.see-more-btn');
            // Check if text overflows (more than 3 lines)
            if (textSpan.scrollHeight > textSpan.offsetHeight + 2) {
                btn.style.display = 'inline';
                btn.onclick = function() {
                    textSpan.classList.toggle('expanded');
                    btn.textContent = textSpan.classList.contains('expanded') ? 'see less' : '...see more';
                };
            } else {
                btn.style.display = 'none';
            }
        });
    }, 0);
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Search and filter functionality
document.getElementById('search-input').addEventListener('input', filterOpportunities);
document.getElementById('type-filter').addEventListener('change', filterOpportunities);
document.getElementById('country-filter').addEventListener('change', filterOpportunities);

function filterOpportunities() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const typeFilter = document.getElementById('type-filter').value;
    const countryFilter = document.getElementById('country-filter').value;

    let filteredOpportunities = allOpportunities.filter(opportunity => {
        const matchesSearch = !searchTerm || 
            opportunity.title.toLowerCase().includes(searchTerm) ||
            opportunity.university.toLowerCase().includes(searchTerm) ||
            opportunity.country.toLowerCase().includes(searchTerm) ||
            opportunity.description.toLowerCase().includes(searchTerm) ||
            (opportunity.requirements && opportunity.requirements.toLowerCase().includes(searchTerm));

        const matchesType = !typeFilter || opportunity.opportunity_type === typeFilter;
        const matchesCountry = !countryFilter || opportunity.country.toLowerCase() === countryFilter.toLowerCase();

        return matchesSearch && matchesType && matchesCountry;
    });

    displayOpportunities(filteredOpportunities);
}

// Additional DOMContentLoaded logic originally in separate script
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.opportunity-description').forEach(function(desc) {
        const textSpan = desc.querySelector('.description-text');
        const btn = desc.querySelector('.see-more-btn');
        // Check if text overflows (more than 3 lines)
        if (textSpan.scrollHeight > textSpan.offsetHeight + 2) {
            btn.style.display = 'inline';
            btn.addEventListener('click', function() {
                textSpan.classList.toggle('expanded');
                btn.textContent = textSpan.classList.contains('expanded') ? 'see less' : '...see more';
            });
        }
    });
});

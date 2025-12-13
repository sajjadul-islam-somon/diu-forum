import { getCachedProfile, onProfileCacheUpdate } from './profileStore.js';

// Setup navbar dropdown toggle
const userProfile = document.querySelector('.user-profile');
const userDropdown = document.getElementById('userDropdown');

if (userProfile && userDropdown) {
    userProfile.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
        if (!userProfile.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.style.display = 'none';
        }
    });
}

const supabase = window.supabaseClient;
const profileCache = new Map();

let cachedProfile = getCachedProfile();
let currentAuthUserId = cachedProfile?.authId || null;
let currentProfileId = cachedProfile?.id || null;
let allItems = [];
let filteredItems = [];
let currentTab = 'found';
let currentFilter = 'all';
let searchQuery = '';
let dateFilter = '';
let locationFilter = '';
let editingItemId = null;

// DOM Elements
const itemsContainer = document.getElementById('itemsContainer');
const searchInput = document.getElementById('searchInput');
const dateFilterInput = document.getElementById('dateFilter');
const locationFilterInput = document.getElementById('locationFilter');
const filterButtons = document.querySelectorAll('.filter-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const createItemBtn = document.getElementById('createItemBtn');
const itemModal = document.getElementById('itemModal');
const detailsModal = document.getElementById('detailsModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const closeDetailsBtn = document.getElementById('closeDetailsBtn');
const cancelBtn = document.getElementById('cancelBtn');
const itemForm = document.getElementById('itemForm');
const modalTitle = document.getElementById('modalTitle');
const submitBtn = document.getElementById('submitBtn');

// Stats elements
const totalItemsEl = document.getElementById('totalItems');
const foundItemsEl = document.getElementById('foundItems');
const handedOverItemsEl = document.getElementById('handedOverItems');
const totalClaimsEl = document.getElementById('totalClaims');

// Profile update listener
onProfileCacheUpdate(profile => {
    cachedProfile = profile || {};
    if (cachedProfile?.authId) currentAuthUserId = cachedProfile.authId;
    if (cachedProfile?.id) currentProfileId = cachedProfile.id;
    hydrateProfileCard();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    hydrateProfileCard();
    loadItems();
    setupEventListeners();
    subscribeToRealtime();
});

// Setup event listeners
function setupEventListeners() {
    // Search
    searchInput?.addEventListener('input', debounce(() => {
        searchQuery = searchInput.value.trim().toLowerCase();
        applyFilters();
    }, 300));

    // Date filter
    dateFilterInput?.addEventListener('change', () => {
        dateFilter = dateFilterInput.value;
        applyFilters();
    });

    // Location filter
    locationFilterInput?.addEventListener('input', debounce(() => {
        locationFilter = locationFilterInput.value.trim().toLowerCase();
        applyFilters();
    }, 300));

    // Tab buttons
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            applyFilters();
        });
    });

    // Modal controls
    createItemBtn?.addEventListener('click', openCreateModal);
    closeModalBtn?.addEventListener('click', closeModal);
    closeDetailsBtn?.addEventListener('click', closeDetailsModal);
    cancelBtn?.addEventListener('click', closeModal);
    itemModal?.addEventListener('click', (e) => {
        if (e.target === itemModal) closeModal();
    });
    detailsModal?.addEventListener('click', (e) => {
        if (e.target === detailsModal) closeDetailsModal();
    });

    // Form submit
    itemForm?.addEventListener('submit', handleSubmit);

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeDetailsModal();
        }
    });
}

// Profile card hydration
function hydrateProfileCard() {
    const userAvatar = document.getElementById('userAvatar');
    const userAvatarImg = document.getElementById('userAvatarImg');
    const userAvatarLetter = document.getElementById('userAvatarLetter');
    const profileName = document.getElementById('profileName');
    const profileType = document.getElementById('profileType');
    const profileDepartment = document.getElementById('profileDepartment');

    if (cachedProfile) {
        const displayName = cachedProfile.displayName || cachedProfile.fullName || 'User';
        const role = cachedProfile.role || 'Student';
        const department = cachedProfile.department || '';
        const avatarUrl = cachedProfile.avatarUrl || cachedProfile.photoUrl;

        if (profileName) profileName.textContent = displayName;
        if (profileType) profileType.textContent = role;
        if (profileDepartment) profileDepartment.textContent = department;

        if (avatarUrl && userAvatarImg) {
            userAvatarImg.src = avatarUrl;
            userAvatarImg.style.display = 'block';
            if (userAvatarLetter) userAvatarLetter.style.display = 'none';
        } else if (userAvatarLetter) {
            userAvatarLetter.textContent = displayName.charAt(0).toUpperCase();
            userAvatarLetter.style.display = 'flex';
            if (userAvatarImg) userAvatarImg.style.display = 'none';
        }
    }
}

// Get current profile ID
async function getCurrentProfileId() {
    if (currentProfileId) return currentProfileId;

    try {
        const session = await supabase.auth.getSession();
        const user = session?.data?.session?.user;
        if (!user?.id) return null;

        const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('auth_id', user.id)
            .maybeSingle();

        currentProfileId = data?.id || null;
        return currentProfileId;
    } catch (err) {
        console.error('Error getting profile ID:', err);
        return null;
    }
}

// Load items
async function loadItems() {
    try {
        showLoading();

        // Try RPC first
        const { data: items, error: rpcError } = await supabase.rpc('rpc_lost_found_items_with_profiles');

        if (rpcError) {
            console.warn('RPC failed, falling back to view:', rpcError);
            const { data: viewData, error: viewError } = await supabase
                .from('lost_found_items_with_profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (viewError) {
                console.warn('View failed, falling back to base table:', viewError);
                const { data: baseData, error: baseError } = await supabase
                    .from('lost_found_items')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (baseError) throw baseError;
                allItems = await enrichItemsWithProfiles(baseData || []);
            } else {
                allItems = viewData || [];
            }
        } else {
            allItems = items || [];
        }

        // Load claims counts
        await loadClaimsCounts();

        applyFilters();
        updateStats();
    } catch (err) {
        console.error('Error loading items:', err);
        showError('Failed to load items. Please refresh the page.');
    }
}

// Enrich items with profile data
async function enrichItemsWithProfiles(items) {
    if (!items || items.length === 0) return [];

    const authorIds = [...new Set(items.map(item => item.author_id).filter(Boolean))];
    if (authorIds.length === 0) return items;

    try {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, display_name, role, department, institution, avatar_url, photo_url, email')
            .in('id', authorIds);

        const profileMap = new Map();
        (profiles || []).forEach(p => {
            profileMap.set(p.id, p);
        });

        return items.map(item => {
            const profile = profileMap.get(item.author_id);
            return {
                ...item,
                author_full_name: profile?.full_name,
                author_display_name: profile?.display_name,
                author_role: profile?.role,
                author_department: profile?.department,
                author_institution: profile?.institution,
                author_avatar_url: profile?.avatar_url,
                author_photo_url: profile?.photo_url,
                author_email: profile?.email
            };
        });
    } catch (err) {
        console.error('Error enriching items:', err);
        return items;
    }
}

// Load claims counts
async function loadClaimsCounts() {
    try {
        const { data: claims } = await supabase
            .from('lost_found_claims')
            .select('item_id, claimer_id');

        const claimsMap = new Map();
        (claims || []).forEach(claim => {
            if (!claimsMap.has(claim.item_id)) {
                claimsMap.set(claim.item_id, []);
            }
            claimsMap.get(claim.item_id).push(claim.claimer_id);
        });

        allItems.forEach(item => {
            item.claims_count = claimsMap.get(item.id)?.length || 0;
            item.claimed_by_me = currentProfileId && claimsMap.get(item.id)?.includes(currentProfileId);
        });
    } catch (err) {
        console.error('Error loading claims:', err);
    }
}

// Apply filters
function applyFilters() {
    let items = [...allItems];

    // Tab filter (only filter by tab, no separate status filter)
    if (currentTab === 'found') {
        items = items.filter(item => !item.handed_over);
    } else if (currentTab === 'handed-over') {
        items = items.filter(item => item.handed_over);
    }

    // Search filter (based on current tab selection)
    if (searchQuery) {
        items = items.filter(item => {
            const itemName = (item.item_name || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            const place = (item.place_found || '').toLowerCase();
            return itemName.includes(searchQuery) || 
                   description.includes(searchQuery) ||
                   place.includes(searchQuery);
        });
    }

    // Date filter
    if (dateFilter) {
        items = items.filter(item => {
            const itemDate = item.date_found ? item.date_found.split('T')[0] : '';
            return itemDate === dateFilter;
        });
    }

    // Location filter
    if (locationFilter) {
        items = items.filter(item => {
            const place = (item.place_found || '').toLowerCase();
            return place.includes(locationFilter);
        });
    }

    filteredItems = items;
    displayItems();
}

// Display items
function displayItems() {
    if (!itemsContainer) return;

    if (filteredItems.length === 0) {
        itemsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>No items found</h3>
                <p>${searchQuery ? 'Try adjusting your search' : 'Be the first to post a found item!'}</p>
            </div>
        `;
        return;
    }

    itemsContainer.innerHTML = filteredItems.map(item => createItemCard(item)).join('');
    attachEventHandlers();
}

// Create item card
function createItemCard(item) {
    const authorName = item.author_display_name || item.author_full_name || 'Anonymous';
    const authorRole = item.author_role || '';
    const authorDept = item.author_department || '';
    const authorAvatar = item.author_avatar_url || item.author_photo_url;
    const authorInitial = authorName.charAt(0).toUpperCase();
    
    const itemName = escapeHtml(item.item_name || 'Untitled Item');
    const description = escapeHtml(item.description || '');
    const phoneNumber = escapeHtml(item.phone_number || '');
    const dateFound = formatDate(item.date_found);
    const timeFound = item.time_found ? formatTime(item.time_found) : '';
    const placeFound = escapeHtml(item.place_found || '');
    const createdAt = formatTimeAgo(item.created_at);
    
    const isOwner = currentProfileId && item.author_id === currentProfileId;
    const claimsCount = item.claims_count || 0;
    const claimedByMe = item.claimed_by_me || false;
    const handedOver = item.handed_over || false;

    return `
        <div class="item-card ${handedOver ? 'handed-over' : ''}" data-item-id="${item.id}">
            <div class="item-card-header">
                <div class="item-author">
                    <div class="item-author-avatar">
                        ${authorAvatar ? 
                            `<img src="${authorAvatar}" alt="${authorName}">` : 
                            authorInitial
                        }
                    </div>
                    <div class="item-author-info">
                        <h4>${authorName}</h4>
                        <div class="item-author-meta">
                            ${authorRole ? `<span><i class="fas fa-user-tag"></i>${authorRole}</span>` : ''}
                            ${authorDept ? `<span><i class="fas fa-building"></i>${authorDept}</span>` : ''}
                        </div>
                    </div>
                </div>
                <button class="item-menu-btn" data-item-id="${item.id}">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="item-menu-dropdown" data-menu-id="${item.id}">
                    ${isOwner ? `
                        <button onclick="editItem('${item.id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button onclick="deleteItem('${item.id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    ` : `
                        <button onclick="reportItem('${item.id}')">
                            <i class="fas fa-flag"></i> Report
                        </button>
                    `}
                </div>
            </div>
            
            <div class="item-card-body">
                <h3 class="item-name">
                    <i class="fas fa-tag"></i>
                    ${itemName}
                    ${handedOver ? '<span class="badge handed-over"><i class="fas fa-check-circle"></i> Handed Over</span>' : ''}
                </h3>
                <p class="item-description">${description}</p>
                <div class="item-details">
                    <div class="item-detail-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span><strong>Place:</strong> ${placeFound}</span>
                    </div>
                    <div class="item-detail-row">
                        <i class="fas fa-calendar"></i>
                        <span><strong>Date:</strong> ${dateFound} ${timeFound ? `at ${timeFound}` : ''}</span>
                    </div>
                    <div class="item-detail-row">
                        <i class="fas fa-clock"></i>
                        <span>Posted ${createdAt}</span>
                    </div>
                </div>
            </div>
            
            <div class="item-card-footer">
                ${!handedOver ? `
                    <button class="claim-btn ${claimedByMe ? 'claimed' : ''}" onclick="toggleClaim('${item.id}')">
                        <i class="fas ${claimedByMe ? 'fa-check-circle' : 'fa-hand-paper'}"></i>
                        ${claimedByMe ? 'Claimed' : 'Claim'} (${claimsCount})
                    </button>
                ` : `
                    <div class="badge handed-over" style="flex: 1; justify-content: center;">
                        <i class="fas fa-handshake"></i> Item Returned
                    </div>
                `}
                <button class="details-btn" onclick="viewDetails('${item.id}')">
                    <i class="fas fa-info-circle"></i> Details
                </button>
                ${isOwner && !handedOver ? `
                    <button class="handover-btn" onclick="toggleHandover('${item.id}')">
                        <i class="fas fa-handshake"></i> Handed Over
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// Attach event handlers
function attachEventHandlers() {
    // Menu buttons
    document.querySelectorAll('.item-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = btn.dataset.itemId;
            const menu = document.querySelector(`[data-menu-id="${itemId}"]`);
            closeAllMenus();
            menu?.classList.toggle('open');
        });
    });

    // Close menus on outside click
    document.addEventListener('click', () => {
        closeAllMenus();
    });
}

function closeAllMenus() {
    document.querySelectorAll('.item-menu-dropdown').forEach(menu => {
        menu.classList.remove('open');
    });
}

// Modal functions
function openCreateModal() {
    if (!currentAuthUserId) {
        alert('Please login to post items');
        return;
    }

    editingItemId = null;
    itemForm?.reset();
    modalTitle.textContent = 'Post Found Item';
    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Item';
    itemModal?.classList.add('show');
}

function closeModal() {
    itemModal?.classList.remove('show');
    editingItemId = null;
    itemForm?.reset();
}

function closeDetailsModal() {
    detailsModal?.classList.remove('show');
}

// Handle form submit
async function handleSubmit(e) {
    e.preventDefault();

    const profileId = await getCurrentProfileId();
    if (!profileId) {
        alert('Profile not found. Please complete your profile first.');
        return;
    }

    const formData = {
        item_name: document.getElementById('itemName').value.trim(),
        description: document.getElementById('itemDescription').value.trim(),
        phone_number: document.getElementById('phoneNumber').value.trim(),
        date_found: document.getElementById('dateFound').value,
        place_found: document.getElementById('placeFound').value.trim(),
        time_found: document.getElementById('timeFound').value || null
    };

    if (!formData.item_name || !formData.description || !formData.phone_number || 
        !formData.date_found || !formData.place_found) {
        alert('Please fill in all required fields');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

    try {
        if (editingItemId) {
            // Update existing item
            const { error } = await supabase
                .from('lost_found_items')
                .update({
                    ...formData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', editingItemId)
                .eq('author_id', profileId);

            if (error) throw error;
        } else {
            // Create new item
            const { error } = await supabase
                .from('lost_found_items')
                .insert({
                    ...formData,
                    author_id: profileId
                });

            if (error) throw error;
        }

        closeModal();
        await loadItems();
    } catch (err) {
        console.error('Error saving item:', err);
        alert('Failed to save item. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Item';
    }
}

// Edit item
window.editItem = async function(itemId) {
    closeAllMenus();
    
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const profileId = await getCurrentProfileId();
    if (item.author_id !== profileId) {
        alert('You can only edit your own items');
        return;
    }

    editingItemId = itemId;
    document.getElementById('itemName').value = item.item_name || '';
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('phoneNumber').value = item.phone_number || '';
    document.getElementById('dateFound').value = item.date_found || '';
    document.getElementById('placeFound').value = item.place_found || '';
    document.getElementById('timeFound').value = item.time_found || '';

    modalTitle.textContent = 'Edit Item';
    submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Item';
    itemModal?.classList.add('show');
};

// Delete item
window.deleteItem = async function(itemId) {
    closeAllMenus();
    
    if (!confirm('Are you sure you want to delete this item?')) return;

    const profileId = await getCurrentProfileId();
    
    try {
        const { error } = await supabase
            .from('lost_found_items')
            .delete()
            .eq('id', itemId)
            .eq('author_id', profileId);

        if (error) throw error;

        await loadItems();
    } catch (err) {
        console.error('Error deleting item:', err);
        alert('Failed to delete item. Please try again.');
    }
};

// Toggle claim
window.toggleClaim = async function(itemId) {
    const profileId = await getCurrentProfileId();
    if (!profileId) {
        alert('Please login to claim items');
        return;
    }

    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    if (item.claimed_by_me) {
        // Unclaim
        try {
            const { error } = await supabase.rpc('rpc_unclaim_item', { p_item_id: itemId });
            if (error) throw error;
            await loadItems();
        } catch (err) {
            console.error('Error unclaiming:', err);
            alert('Failed to unclaim item. Please try again.');
        }
    } else {
        // Claim
        try {
            const { error } = await supabase.rpc('rpc_claim_item', { p_item_id: itemId });
            if (error) throw error;
            await loadItems();
        } catch (err) {
            console.error('Error claiming:', err);
            alert('Failed to claim item. Please try again.');
        }
    }
};

// Toggle handover status
window.toggleHandover = async function(itemId) {
    if (!confirm('Mark this item as handed over?')) return;

    try {
        const { data, error } = await supabase.rpc('rpc_toggle_handed_over', { p_item_id: itemId });
        if (error) throw error;
        await loadItems();
    } catch (err) {
        console.error('Error toggling handover:', err);
        alert('Failed to update status. Please try again.');
    }
};

// View details
window.viewDetails = async function(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    // Load claimants
    let claimants = [];
    try {
        const { data } = await supabase
            .from('lost_found_claims')
            .select(`
                claimer_id,
                claimed_at,
                profiles:claimer_id (
                    full_name,
                    display_name,
                    email,
                    avatar_url
                )
            `)
            .eq('item_id', itemId)
            .order('claimed_at', { ascending: false });

        claimants = data || [];
    } catch (err) {
        console.error('Error loading claimants:', err);
    }

    const authorName = item.author_display_name || item.author_full_name || 'Anonymous';
    const itemName = escapeHtml(item.item_name || 'Untitled');
    const description = escapeHtml(item.description || '');
    const phoneNumber = escapeHtml(item.phone_number || 'Not provided');
    const authorEmail = escapeHtml(item.author_email || 'Not available');
    const dateFound = formatDate(item.date_found);
    const timeFound = item.time_found ? formatTime(item.time_found) : 'Not specified';
    const placeFound = escapeHtml(item.place_found || '');

    const detailsContent = document.getElementById('detailsContent');
    detailsContent.innerHTML = `
        <div class="details-section">
            <h3><i class="fas fa-box"></i> Item Information</h3>
            <div class="details-grid">
                <div class="details-item">
                    <i class="fas fa-tag"></i>
                    <div class="details-item-content">
                        <div class="details-item-label">Item Name</div>
                        <div class="details-item-value">${itemName}</div>
                    </div>
                </div>
                <div class="details-item">
                    <i class="fas fa-align-left"></i>
                    <div class="details-item-content">
                        <div class="details-item-label">Description</div>
                        <div class="details-item-value">${description}</div>
                    </div>
                </div>
                <div class="details-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <div class="details-item-content">
                        <div class="details-item-label">Place Found</div>
                        <div class="details-item-value">${placeFound}</div>
                    </div>
                </div>
                <div class="details-item">
                    <i class="fas fa-calendar"></i>
                    <div class="details-item-content">
                        <div class="details-item-label">Date Found</div>
                        <div class="details-item-value">${dateFound}</div>
                    </div>
                </div>
                <div class="details-item">
                    <i class="fas fa-clock"></i>
                    <div class="details-item-content">
                        <div class="details-item-label">Time Found</div>
                        <div class="details-item-value">${timeFound}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="details-section">
            <h3><i class="fas fa-user"></i> Contact Information</h3>
            <div class="details-grid">
                <div class="details-item">
                    <i class="fas fa-user-circle"></i>
                    <div class="details-item-content">
                        <div class="details-item-label">Posted By</div>
                        <div class="details-item-value">${authorName}</div>
                    </div>
                </div>
                <div class="details-item">
                    <i class="fas fa-envelope"></i>
                    <div class="details-item-content">
                        <div class="details-item-label">Email</div>
                        <div class="details-item-value">${authorEmail}</div>
                    </div>
                </div>
                <div class="details-item">
                    <i class="fas fa-phone"></i>
                    <div class="details-item-content">
                        <div class="details-item-label">Phone Number</div>
                        <div class="details-item-value">${phoneNumber}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="details-section">
            <h3><i class="fas fa-users"></i> Claimants (${claimants.length})</h3>
            ${claimants.length > 0 ? `
                <ul class="claimants-list">
                    ${claimants.map(claim => {
                        const profile = claim.profiles || {};
                        const name = profile.display_name || profile.full_name || 'Anonymous';
                        const email = profile.email || 'Not available';
                        const avatar = profile.avatar_url;
                        const initial = name.charAt(0).toUpperCase();
                        
                        return `
                            <li class="claimant-item">
                                <div class="claimant-avatar">
                                    ${avatar ? `<img src="${avatar}" alt="${name}">` : initial}
                                </div>
                                <div class="claimant-info">
                                    <div class="claimant-name">${escapeHtml(name)}</div>
                                    <div class="claimant-email">${escapeHtml(email)}</div>
                                </div>
                            </li>
                        `;
                    }).join('')}
                </ul>
            ` : `
                <div class="no-claimants">
                    <i class="fas fa-inbox"></i>
                    <p>No one has claimed this item yet</p>
                </div>
            `}
        </div>
    `;

    detailsModal?.classList.add('show');
};

// Report item
window.reportItem = async function(itemId) {
    closeAllMenus();
    
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const reason = prompt('Please describe why you are reporting this item:');
    if (!reason || !reason.trim()) return;

    try {
        const profileId = await getCurrentProfileId();

        const { error } = await supabase
            .from('reports')
            .insert({
                item_id: itemId,
                item_type: 'lost_found',
                reason: reason.trim(),
                reporter_id: profileId
            });

        if (error) throw error;

        alert('Thank you for your report. We will review it shortly.');
    } catch (err) {
        console.error('Error reporting item:', err);
        alert('Failed to submit report. Please try again.');
    }
};

// Update stats
function updateStats() {
    const total = allItems.length;
    const found = allItems.filter(i => !i.handed_over).length;
    const handedOver = allItems.filter(i => i.handed_over).length;
    const claims = allItems.reduce((sum, item) => sum + (item.claims_count || 0), 0);

    if (totalItemsEl) totalItemsEl.textContent = total;
    if (foundItemsEl) foundItemsEl.textContent = found;
    if (handedOverItemsEl) handedOverItemsEl.textContent = handedOver;
    if (totalClaimsEl) totalClaimsEl.textContent = claims;
}

// Loading and error states
function showLoading() {
    if (itemsContainer) {
        itemsContainer.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading items...</p>
            </div>
        `;
    }
}

function showError(message) {
    if (itemsContainer) {
        itemsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error</h3>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    }
}

// Subscribe to realtime updates
function subscribeToRealtime() {
    if (!supabase?.channel) return;

    try {
        const channel = supabase.channel('lost_found_realtime');
        
        // Listen to items changes
        channel.on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'lost_found_items' 
        }, () => {
            loadItems();
        });

        // Listen to claims changes
        channel.on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'lost_found_claims' 
        }, () => {
            loadItems();
        });

        // Listen to profiles changes
        channel.on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'profiles' 
        }, () => {
            loadItems();
        });

        channel.subscribe();
    } catch (err) {
        console.error('Error setting up realtime:', err);
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function formatTime(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
}

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

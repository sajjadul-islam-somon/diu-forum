const CACHE_KEY = 'diuProfile';
const PROFILE_EVENT = 'profile-cache-updated';

const FIELD_MAP = {
    displayName: 'display_name',
    role: 'role',
    department: 'department',
    institution: 'institution',
    bio: 'bio',
    primaryEmail: 'primary_email',
    phone: 'phone',
    whatsapp: 'whatsapp',
    telegram: 'telegram',
    linkedin: 'linkedin',
    website: 'website'
};

function getSupabase() {
    const client = window?.supabaseClient;
    if (!client) throw new Error('[profileStore] Supabase client not initialized');
    return client;
}

function safeParse(json) {
    try { return JSON.parse(json); } catch (_) { return null; }
}

function readCache() {
    if (typeof localStorage === 'undefined') return {};
    const raw = safeParse(localStorage.getItem(CACHE_KEY) || 'null');
    return raw && typeof raw === 'object' ? raw : {};
}

let cachedProfile = readCache();

function writeCache(profile) {
    cachedProfile = profile ? { ...profile } : {};
    if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cachedProfile)); } catch (_) {}
    }
    try { window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: { profile: cachedProfile } })); } catch (_) {}
    return cachedProfile;
}

function valueOrEmpty(val) {
    if (val === null || val === undefined) return '';
    return String(val);
}

function rowToProfile(row, user) {
    if (!row && !user && !cachedProfile) return null;
    const metadata = user?.user_metadata || {};
    const fallbackName = cachedProfile.displayName || metadata.full_name || metadata.name || user?.email || '';
    const fallbackEmail = (row?.primary_email || row?.email || user?.email || metadata.email || '').toLowerCase();
    return {
        id: row?.id || cachedProfile.id || null,
        authId: row?.auth_id || user?.id || cachedProfile.authId || null,
        displayName: row?.display_name || row?.full_name || cachedProfile.displayName || fallbackName,
        role: valueOrEmpty(row?.role || cachedProfile.role),
        department: valueOrEmpty(row?.department || cachedProfile.department),
        institution: valueOrEmpty(row?.institution || cachedProfile.institution),
        bio: valueOrEmpty(row?.bio || cachedProfile.bio),
        primaryEmail: fallbackEmail || cachedProfile.primaryEmail || '',
        phone: valueOrEmpty(row?.phone || cachedProfile.phone),
        whatsapp: valueOrEmpty(row?.whatsapp || cachedProfile.whatsapp),
        telegram: valueOrEmpty(row?.telegram || cachedProfile.telegram),
        linkedin: valueOrEmpty(row?.linkedin || cachedProfile.linkedin),
        website: valueOrEmpty(row?.website || cachedProfile.website),
        avatarUrl: row?.avatar_url || cachedProfile.avatarUrl || metadata.avatar_url || metadata.picture || '',
        updatedAt: row?.updated_at || cachedProfile.updatedAt || null
    };
}

function patchToRow(patch, user) {
    const row = {};
    Object.entries(FIELD_MAP).forEach(([key, column]) => {
        if (patch[key] !== undefined) row[column] = patch[key] === '' ? null : patch[key];
    });
    if (patch.displayName !== undefined) {
        const val = patch.displayName || null;
        row.full_name = val;
    }
    if (user?.email) {
        const normalized = String(user.email).toLowerCase();
        row.email = normalized;
        row.primary_email = normalized;
    } else if (patch.primaryEmail) {
        row.primary_email = patch.primaryEmail;
    }
    row.updated_at = new Date().toISOString();
    return row;
}

export function getCachedProfile() {
    return cachedProfile ? { ...cachedProfile } : {};
}

export function onProfileCacheUpdate(callback) {
    if (typeof callback !== 'function') return () => {};
    function handler(ev) { callback(ev?.detail?.profile || getCachedProfile()); }
    window.addEventListener(PROFILE_EVENT, handler);
    return () => window.removeEventListener(PROFILE_EVENT, handler);
}

export async function ensureProfileRow(user) {
    if (!user) return null;
    const client = getSupabase();
    const authId = user.id;
    const lowerEmail = user.email ? String(user.email).toLowerCase() : null;

    try {
        let { data, error } = await client.from('profiles').select('*').eq('auth_id', authId).maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) return data;

        if (lowerEmail) {
            const byEmail = await client.from('profiles').select('*').eq('email', lowerEmail).maybeSingle();
            if (byEmail.error && byEmail.error.code !== 'PGRST116') throw byEmail.error;
            if (byEmail.data) {
                const update = await client.from('profiles')
                    .update({ auth_id: authId, primary_email: lowerEmail, updated_at: new Date().toISOString() })
                    .eq('id', byEmail.data.id)
                    .select()
                    .single();
                if (update.error) throw update.error;
                return update.data;
            }
        }

        const insertPayload = {
            auth_id: authId,
            email: lowerEmail,
            primary_email: lowerEmail,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || lowerEmail,
            display_name: user.user_metadata?.full_name || user.user_metadata?.name || lowerEmail,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
            updated_at: new Date().toISOString()
        };
        const insertRes = await client.from('profiles').insert([insertPayload]).select('*').single();
        if (insertRes.error) throw insertRes.error;
        return insertRes.data;
    } catch (err) {
        console.warn('[profileStore] ensureProfileRow failed', err);
        return null;
    }
}

export async function fetchProfile(user, options = {}) {
    const client = getSupabase();
    if (!user) return getCachedProfile();
    try {
        let { data, error } = await client.from('profiles').select('*').eq('auth_id', user.id).maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        if (!data && options.createIfMissing !== false) {
            data = await ensureProfileRow(user);
        }
        if (!data) return getCachedProfile();
        const profile = rowToProfile(data, user);
        writeCache(profile);
        return profile;
    } catch (err) {
        console.warn('[profileStore] fetchProfile failed', err);
        return getCachedProfile();
    }
}

export async function saveProfile(user, patch = {}) {
    const client = getSupabase();
    if (!user) throw new Error('Cannot save profile without auth user');

    // Ensure the cached row (and DB row) has the correct auth_id before attempting the upsert,
    // otherwise RLS will reject the operation.
    if (!cachedProfile?.authId || cachedProfile.authId !== user.id) {
        const ensured = await ensureProfileRow(user);
        if (ensured) {
            cachedProfile = rowToProfile(ensured, user) || cachedProfile;
        }
    }

    const payload = {
        auth_id: user.id,
        ...patchToRow(patch, user)
    };
    if (cachedProfile?.id) payload.id = cachedProfile.id;

    const { data, error } = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'auth_id' })
        .select('*')
        .single();

    if (error) throw error;
    const profile = rowToProfile(data, user);
    writeCache(profile);
    return profile;
}

export { PROFILE_EVENT };

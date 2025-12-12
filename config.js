// config.js
// 1. Load the Supabase Client
// Make sure you included the script tag in your HTML head first!
// Supabase Project ID: enmzsefviecyrdbqyifk

const supabaseUrl = 'https://enmzsefviecyrdbqyifk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubXpzZWZ2aWVjeXJkYnF5aWZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDIxMjMsImV4cCI6MjA3OTg3ODEyM30.1NK6s_eZpy9ntwzZna6YBsjf1ltnQ1C2ZvknUywq95U';

// Initialize the client
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
	},
});

// Export it globally so other files can use "supabase"
window.supabaseClient = supabase;

// Safe localStorage wrapper to avoid exceptions when browser blocks storage
window.safeLocal = {
	getItem(key) {
		try {
			if (typeof localStorage === 'undefined') return null;
			return localStorage.getItem(key);
		} catch (e) {
			return null;
		}
	},
	setItem(key, value) {
		try {
			if (typeof localStorage === 'undefined') return;
			localStorage.setItem(key, value);
		} catch (e) {
			// ignore
		}
	},
	removeItem(key) {
		try {
			if (typeof localStorage === 'undefined') return;
			localStorage.removeItem(key);
		} catch (e) {
			// ignore
		}
	}
};
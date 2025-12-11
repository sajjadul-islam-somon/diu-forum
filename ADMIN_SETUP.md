# Admin Panel Setup Guide

## Overview
A secure, standalone admin panel for DIU Forum with content moderation capabilities.

## Access
- **URL**: `https://your-domain.com/admin.html` (or `/admin`)
- **Username**: `admin`
- **Password**: `nuha1234`
- **Note**: Not linked from main navigation - access via direct URL only

## Features

### 1. Dashboard Overview
- **Statistics**: Real-time counts for posts, jobs, studies, users, and pending reports
- **Recent Activity**: Latest content submissions across all sections
- **Quick Insights**: At-a-glance view of community activity

### 2. Reports Management
- View all user-submitted reports for inappropriate content
- Filter by:
  - Status (Pending, Reviewed, Resolved, Dismissed)
  - Content Type (Blog Posts, Jobs, Studies)
- Actions:
  - View reported content details
  - Delete problematic content
  - Resolve or dismiss reports
  - Track report history

### 3. Content Management
- Browse all content across:
  - Blog Posts
  - Job Listings
  - Study Opportunities
- Search functionality
- View details and delete any content
- Direct moderation without reports

### 4. User Management
- View all registered users
- Search by name or email
- View user profiles with:
  - Contact information
  - Role and department
  - Join date
  - Activity overview

### 5. Settings
- **Moderation Settings**: Configure auto-flagging rules
- **Database Actions**: Refresh statistics, export reports
- **Cache Management**: Clear cached data

## Setup Instructions

### Step 1: Deploy Admin Files
Upload these files to your web server:
- `admin.html`
- `admin.css`
- `admin.js`

Ensure they're in the root directory alongside `index.html`, `blog.html`, etc.

### Step 2: Create Reports Table
Run this SQL in Supabase SQL Editor:

```sql
-- Reports table for content moderation
create table if not exists public.reports (
  id uuid not null default gen_random_uuid(),
  item_id uuid not null,
  item_type text not null,
  reason text not null,
  reporter_id uuid,
  reporter_email text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  notes text,
  constraint reports_pkey primary key (id),
  constraint reports_reporter_id_fkey foreign key (reporter_id) references public.profiles (id) on delete set null,
  constraint reports_item_type_check check (
    item_type = any (array['post'::text, 'job'::text, 'study'::text])
  ),
  constraint reports_status_check check (
    status = any (array['pending'::text, 'reviewed'::text, 'resolved'::text, 'dismissed'::text])
  )
);

-- Indexes for efficient querying
create index if not exists reports_item_idx on public.reports (item_id, item_type);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists reports_created_at_idx on public.reports (created_at desc);

-- Enable RLS
alter table public.reports enable row level security;

-- Allow authenticated users to submit reports
create policy reports_insert_authenticated
on public.reports
for insert
to authenticated
with check (true);

-- Allow authenticated users to view their own reports
create policy reports_select_own
on public.reports
for select
to authenticated
using (
  reporter_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);
```

### Step 3: Grant Admin Access (Optional)
For enhanced security, you can use service role key for admin operations:
1. In Supabase Dashboard → Settings → API
2. Copy the `service_role` key (keep it secret!)
3. Use it in admin panel for elevated permissions

### Step 4: Configure Vercel (if deployed)
Add `admin.html` to your `vercel.json` rewrites:

```json
{
  "rewrites": [
    { "source": "/admin", "destination": "/admin.html" },
    { "source": "/", "destination": "/index.html" },
    { "source": "/blog", "destination": "/blog.html" },
    { "source": "/jobs", "destination": "/jobs.html" },
    { "source": "/studies", "destination": "/studies.html" }
  ]
}
```

## User Reporting Feature

Users can now report inappropriate content:

### How Users Report Content
1. Click the **three-dot menu** (⋮) on any post, job, or study
2. Select **"Report"** (only visible on content they don't own)
3. Enter a reason for the report
4. Submit

### What Happens Next
1. Report is saved to the `reports` table with status "pending"
2. Admin sees it in the Reports tab with a count badge
3. Admin can:
   - View the reported content
   - Delete it if inappropriate
   - Mark as resolved or dismissed
   - Add notes for tracking

## Security Notes

### Authentication
- Credentials are hardcoded in `admin.js` for simplicity
- Session expires after 1 hour of inactivity
- For production, consider:
  - Environment variables for credentials
  - Server-side authentication
  - Two-factor authentication

### Access Control
- Admin panel URL is not linked from main site
- Requires direct URL access
- Consider adding IP whitelist for extra security
- Use HTTPS in production

### RLS (Row Level Security)
- Admin queries use service-level access
- Regular users can only report content, not view/modify reports from others
- Supabase RLS policies protect data integrity

## Customization

### Change Admin Credentials
Edit `admin.js` line 5-8:
```javascript
const ADMIN_CREDENTIALS = {
    username: 'your_username',
    password: 'your_secure_password'
};
```

### Adjust Session Duration
Edit `admin.js` line 11:
```javascript
const SESSION_DURATION = 3600000; // milliseconds (default: 1 hour)
```

### Styling
Modify `admin.css` to match your brand colors and design preferences.

## Troubleshooting

### Can't Login
- Check credentials in `admin.js`
- Clear browser cache and localStorage
- Verify `admin.html` loads correctly

### Reports Not Showing
- Ensure `reports` table exists in Supabase
- Check RLS policies allow service role to select all
- Verify `config.js` has correct Supabase credentials

### Can't Delete Content
- Check Supabase RLS policies on content tables
- Ensure service role has proper permissions
- Verify foreign key constraints allow cascading deletes

### Statistics Not Loading
- Check browser console for errors
- Verify all tables exist (posts, jobs, education_opportunities, profiles)
- Ensure Supabase connection is active

## Best Practices

1. **Regular Monitoring**: Check pending reports daily
2. **Document Actions**: Use notes field to track moderation decisions
3. **Community Guidelines**: Establish clear content policies
4. **User Communication**: Consider notifying users when content is removed
5. **Backup Data**: Export reports periodically for record-keeping
6. **Review Patterns**: Analyze report trends to improve auto-moderation

## Future Enhancements

Consider adding:
- Email notifications for new reports
- Bulk actions for content management
- Advanced analytics dashboard
- User ban/suspension capabilities
- Automated spam detection
- Report appeal system
- Audit log for admin actions

## Support

For issues or questions:
1. Check browser console for error messages
2. Review Supabase logs
3. Verify all SQL migrations ran successfully
4. Test with fresh browser session

---

**Last Updated**: December 2025
**Version**: 1.0.0

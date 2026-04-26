// ─────────────────────────────────────────────────────────────────────────────
// HOW TO WIRE THE NEW COMPONENTS INTO EXISTING FILES
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// 1. app/admin/page.tsx  — Admin Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

// A) ADD IMPORTS at the top of the file, alongside the other admin component imports:

import { DocumentUploadPanel }      from '@/components/admin/DocumentUploadPanel';
import {
  NotificationControlPanel,
  NotificationBell,
  NotificationDropdown,
} from '@/components/admin/NotificationControlPanel';

// B) ADD to the NAV array (inside the 'Management' section or create a new section):

const NAV = [
  // ... existing entries ...
  { section: 'Client Portal' },
  { id: 'documents',      icon: '📁', label: 'Document Upload'    },
  { id: 'notifications',  icon: '🔔', label: 'Notifications'      },
  // ... rest of existing entries ...
];

// C) ADD state for notification dropdown near other useState hooks:

const [notifOpen, setNotifOpen] = useState(false);

// D) ADD the Bell icon in the header bar (find where the logout/user info is):
// Replace or augment the header right-side section with:

<div style={{ position: 'relative' }}>
  <NotificationBell onClick={() => setNotifOpen(v => !v)} />
  {notifOpen && (
    <NotificationDropdown
      onClose={() => setNotifOpen(false)}
      onViewAll={() => { setNotifOpen(false); setTab('notifications'); }}
    />
  )}
</div>

// E) ADD the tab render blocks inside the main content area switch/if-else:
// Find the pattern like:  if (tab === 'schools') return <SchoolsPageWithApproval ... />
// Add AFTER the existing blocks:

{tab === 'documents'     && <DocumentUploadPanel showToast={showToast} />}
{tab === 'notifications' && <NotificationControlPanel showToast={showToast} />}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. app/school/dashboard/page.tsx  — Client / School Portal
// ═══════════════════════════════════════════════════════════════════════════════

// A) ADD IMPORTS at the top:

import { ClientDocumentsTab }         from '@/components/school/ClientDocumentsTab';
import {
  SchoolNotificationBell,
  SchoolNotificationsPanel,
} from '@/components/school/SchoolNotificationsPanel';

// B) ADD Documents and Notifications tabs to the school dashboard tab list.
//    Find the existing tab definitions (look for something like tabList or TAB_LIST):

// If tabs are defined as an array, add:
{ id: 'documents',     icon: '📁', label: 'Documents'      },
{ id: 'notifications', icon: '🔔', label: 'Notifications'  },

// C) ADD the Bell icon in the school dashboard header (find the top nav bar):

<div style={{ position: 'relative' }}>
  <SchoolNotificationBell onOpenNotifications={() => setActiveTab('notifications')} />
</div>

// D) ADD tab content render (inside the content switch):

{activeTab === 'documents'     && <ClientDocumentsTab />}
{activeTab === 'notifications' && <SchoolNotificationsPanel />}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. next.config.js  — allow Supabase Storage URLs for image preview
// ═══════════════════════════════════════════════════════════════════════════════

// In thynk-registration/next.config.js, add to the images config:

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
  },
};
module.exports = nextConfig;

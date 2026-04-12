// app/registration/[projectSlug]/page.tsx
// Route: /registration/mentalmath2026
// Route: /registration/mentalmath2026?school=SCHOOLCODE  ← school pre-selected via query param
// Shows mode chooser → School Registration OR Student Registration (open picker)

import OpenRegistrationPage from '@/components/registration/OpenRegistrationPage';
import LockedSchoolPage from '@/components/registration/LockedSchoolPage';

export default function ProjectRegistrationPage({
  params,
  searchParams,
}: {
  params: { projectSlug: string };
  searchParams: { school?: string; paymentError?: string };
}) {
  // If ?school=<code> is present, render the locked school registration view directly
  if (searchParams.school) {
    return (
      <main className="reg-page">
        <LockedSchoolPage
          projectSlug={params.projectSlug}
          schoolCode={searchParams.school}
          paymentError={searchParams.paymentError === '1'}
        />
      </main>
    );
  }

  return (
    <main className="reg-page">
      <OpenRegistrationPage
        projectSlug={params.projectSlug}
        paymentError={searchParams.paymentError === '1'}
      />
    </main>
  );
}

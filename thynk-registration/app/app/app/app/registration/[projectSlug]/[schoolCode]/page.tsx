// app/registration/[projectSlug]/[schoolCode]/page.tsx
// Route: /registration/mentalmath2026/test
// School is locked from URL — student fills personal details only

import LockedSchoolPage from '@/components/registration/LockedSchoolPage';

export default function SchoolRegistrationPage({
  params,
  searchParams,
}: {
  params: { projectSlug: string; schoolCode: string };
  searchParams: { paymentError?: string };
}) {
  return (
    <main className="reg-page">
      <LockedSchoolPage
        projectSlug={params.projectSlug}
        schoolCode={params.schoolCode}
        paymentError={searchParams.paymentError === '1'}
      />
    </main>
  );
}

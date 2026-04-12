// app/registration/[projectSlug]/page.tsx
// Route: /registration/mentalmath2026
// Shows mode chooser → School Registration OR Student Registration (open picker)

import OpenRegistrationPage from '@/components/registration/OpenRegistrationPage';

export default function ProjectRegistrationPage({
  params,
  searchParams,
}: {
  params: { projectSlug: string };
  searchParams: { paymentError?: string };
}) {
  return (
    <main className="reg-page">
      <OpenRegistrationPage
        projectSlug={params.projectSlug}
        paymentError={searchParams.paymentError === '1'}
      />
    </main>
  );
}

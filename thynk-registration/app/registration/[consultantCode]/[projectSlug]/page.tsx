// app/registration/[consultantCode]/[projectSlug]/page.tsx
//
// Curated consultant link:
//   /registration/<consultantCode>/<projectSlug>
//   /registration/<consultantCode>/<projectSlug>?school=<code>
//
// Schools that register via this URL are automatically tagged with the consultant.
// Everything else (student flow, school flow, slugs, payment) is UNCHANGED.

import OpenRegistrationPage from '@/components/registration/OpenRegistrationPage';
import LockedSchoolPage from '@/components/registration/LockedSchoolPage';

export default function ConsultantRegistrationPage({
  params,
  searchParams,
}: {
  params: { consultantCode: string; projectSlug: string };
  searchParams: { school?: string; paymentError?: string };
}) {
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
        consultantCode={params.consultantCode}
      />
    </main>
  );
}

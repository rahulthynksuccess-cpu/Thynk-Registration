// app/registration/[projectSlug]/page.tsx
// UNCHANGED routes:
//   /registration/brishark
//   /registration/brishark?school=SCHOOLCODE
// NEW route (consultant curated link):
//   /registration/brishark?consultant=cons001
// NEW route (ThynkFlow lead curated link — pre-filled, jumps straight to
// the school form):
//   /registration/brishark?consultant=cons001&name=ABC+School&city=Pune&contactName=Jane&contactEmail=jane@x.com&contactMobile=9999999999

import OpenRegistrationPage from '@/components/registration/OpenRegistrationPage';
import LockedSchoolPage from '@/components/registration/LockedSchoolPage';

export default function ProjectRegistrationPage({
  params,
  searchParams,
}: {
  params: { projectSlug: string };
  searchParams: {
    school?: string; paymentError?: string; consultant?: string;
    name?: string; city?: string; contactName?: string; contactEmail?: string; contactMobile?: string;
  };
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
        consultantCode={searchParams.consultant}
        prefillName={searchParams.name}
        prefillCity={searchParams.city}
        prefillContactName={searchParams.contactName}
        prefillContactEmail={searchParams.contactEmail}
        prefillContactMobile={searchParams.contactMobile}
      />
    </main>
  );
}

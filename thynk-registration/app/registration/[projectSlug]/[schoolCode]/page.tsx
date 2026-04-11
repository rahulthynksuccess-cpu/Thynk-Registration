import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import RegistrationCard from '@/components/registration/RegistrationCard';

interface Props {
  params: { projectSlug: string; schoolCode: string };
  searchParams: { payment?: string };
}

async function fetchSchool(projectSlug: string, schoolCode: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://thynk-registration.vercel.app';
  const res = await fetch(
    `${baseUrl}/api/school/${schoolCode}?project=${projectSlug}`,
    { next: { revalidate: 300 } }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const school = await fetchSchool(params.projectSlug, params.schoolCode);
  if (!school) return { title: 'Registration' };
  return {
    title: `Register — ${school.name}`,
    description: school.branding?.programDescription ?? `Register for ${school.name}`,
  };
}

export default async function RegistrationPage({ params, searchParams }: Props) {
  const school = await fetchSchool(params.projectSlug, params.schoolCode);
  if (!school) notFound();

  const pricing = school.pricing?.[0];
  if (!pricing) notFound();

  return (
    <main
      className="reg-page"
      style={{
        '--brand-primary': school.branding?.primaryColor ?? '#4f46e5',
        '--brand-accent':  school.branding?.accentColor  ?? '#8b5cf6',
      } as React.CSSProperties}
    >
      <RegistrationCard
        school={school}
        pricing={pricing}
        projectSlug={params.projectSlug}
        paymentError={searchParams.payment === 'failed' || searchParams.payment === 'error'}
      />
    </main>
  );
}

import { redirect } from 'next/navigation';

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  redirect(`/astrologer/p/${personId}/profile/life-map`);
}

'use client';
import { useRouter } from 'next/navigation';
import { RecordsPage } from '@/components/records/RecordsPage';
import { useLearningRecords } from '@/components/records/useLearningRecords';
export default function Page() {
  const router = useRouter();
  const { data, error, reload } = useLearningRecords();
  return <RecordsPage key={data?.learnerId} name={data?.name ?? ''} progress={data?.progress ?? null} stats={data?.stats ?? null} sessions={data?.sessions ?? null} error={error} onRetry={reload} onStart={() => router.push('/')} />;
}

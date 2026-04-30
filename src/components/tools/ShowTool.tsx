'use client';

import { ShowParams } from '@/types/tools';

interface ShowToolProps {
  params: ShowParams;
  imageUrl: string;
}

export function ShowTool({ params, imageUrl }: ShowToolProps) {
  return (
    <img
      src={imageUrl}
      alt={params.image_id}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}

'use client';

import { useState, useEffect } from 'react';
import { ShowTool } from '@/components/tools/ShowTool';
import { FocusTool } from '@/components/tools/FocusTool';
import { AnnotateTool } from '@/components/tools/AnnotateTool';
import { ToolAction, FocusParams, AnnotateParams, ShowParams } from '@/types/tools';
import { CourseImage, ImageRegion } from '@/types/course';

interface ImageCanvasProps {
  images: CourseImage[];
  currentImageId: string;
  actions: ToolAction[];
}

export function ImageCanvas({ images, currentImageId, actions }: ImageCanvasProps) {
  const [activeFocus, setActiveFocus] = useState<{ params: FocusParams; region: ImageRegion } | null>(null);
  const [activeAnnotates, setActiveAnnotates] = useState<{ params: AnnotateParams; region: ImageRegion }[]>([]);
  const [currentShow, setCurrentShow] = useState<ShowParams>({ image_id: currentImageId });

  const currentImage = images.find((img) => img.id === currentShow.image_id) || images[0];
  if (!currentImage) return null;

  useEffect(() => {
    const focuses: { params: FocusParams; region: ImageRegion }[] = [];
    const annotates: { params: AnnotateParams; region: ImageRegion }[] = [];

    for (const action of actions) {
      if (action.tool === 'show') {
        setCurrentShow(action.params as ShowParams);
      }
      if (action.tool === 'focus') {
        const params = action.params as FocusParams;
        const region = currentImage.regions.find((r) => r.id === params.target);
        if (region) {
          focuses.push({ params, region });
        }
      }
      if (action.tool === 'annotate') {
        const params = action.params as AnnotateParams;
        const region = currentImage.regions.find((r) => r.id === params.target);
        if (region) {
          annotates.push({ params, region });
        }
      }
    }

    setActiveFocus(focuses[0] || null);
    setActiveAnnotates(annotates);
  }, [actions, currentImage]);

  // Clear focus after animation
  useEffect(() => {
    if (activeFocus) {
      const timer = setTimeout(() => setActiveFocus(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [activeFocus]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#f3f4f6', borderRadius: '0.5rem', overflow: 'hidden' }}>
      <ShowTool params={currentShow} imageUrl={currentImage.url} />

      {activeFocus && (
        <FocusTool
          params={activeFocus.params}
          region={activeFocus.region}
        />
      )}

      {activeAnnotates.map((annotate, i) => (
        <AnnotateTool
          key={`${annotate.params.type}-${annotate.params.target}-${i}`}
          params={annotate.params}
          region={annotate.region}
        />
      ))}
    </div>
  );
}

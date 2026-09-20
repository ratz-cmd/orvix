import React from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

const PILL_WIDTHS = [70, 80, 100, 90, 85, 75];

const GenreSkeleton: React.FC = () => {
  return (
    <div className="flex flex-wrap gap-2 animate-skeleton-fade">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton
          key={index}
          variant="pill"
          width={PILL_WIDTHS[index % PILL_WIDTHS.length]}
          height={36}
        />
      ))}
    </div>
  );
};

export default GenreSkeleton;

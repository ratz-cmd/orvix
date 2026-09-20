import React from 'react';
import RLSSkeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'poster' | 'text' | 'circle' | 'pill' | 'button';

interface SkeletonProps {
  variant?: Variant;
  width?: string | number;
  height?: string | number;
  count?: number;
  className?: string;
  containerClassName?: string;
  inline?: boolean;
  baseColor?: string;
  highlightColor?: string;
}

const variantBorderRadius: Record<Variant, string | number | undefined> = {
  default: undefined,
  poster:  '0.5rem',
  text:    '0.25rem',
  circle:  '9999px',
  pill:    '9999px',
  button:  '0.75rem',
};

const variantStyle: Record<Variant, React.CSSProperties | undefined> = {
  default: undefined,
  poster:  { aspectRatio: '2 / 3' },
  text:    undefined,
  circle:  undefined,
  pill:    undefined,
  button:  undefined,
};

// Couleurs par défaut alignées sur le thème sombre du site (body bg = #000).
// Sans ça, react-loading-skeleton utilise #ebebeb / #f5f5f5 (presque blanc) →
// effet "flash blanc" pendant le scroll quand des sections se chargent.
// Override possible via les props baseColor / highlightColor au cas par cas.
const DARK_BASE = '#1a1a1a';
const DARK_HIGHLIGHT = '#2a2a2a';

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'default',
  width,
  height,
  count,
  className,
  containerClassName,
  inline,
  baseColor = DARK_BASE,
  highlightColor = DARK_HIGHLIGHT,
}) => (
  <RLSSkeleton
    width={width}
    height={height}
    count={count}
    inline={inline}
    className={cn(className)}
    containerClassName={containerClassName}
    borderRadius={variantBorderRadius[variant]}
    style={variantStyle[variant]}
    baseColor={baseColor}
    highlightColor={highlightColor}
  />
);

export default Skeleton;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from './tooltip';

/**
 * Bouton pin/unpin réutilisable — Milestone 4 (priorité des sources).
 *
 * Utilisé dans :
 *  - rangée des boutons de source top-level (HLSPlayerSettingsPanel)
 *  - sélecteur de langue (WatchAnime)
 *  - menu serveurs par hoster (HLSPlayerSettingsPanel)
 *  - cards du panneau Settings (Milestone 5+)
 *
 * Comportement :
 *  - outlined `Pin` quand non épinglé, `PinOff` rempli (rotated naturally by
 *    Lucide) quand épinglé.
 *  - couleur : amber-400 quand pinned, neutral-400 sinon.
 *  - `e.stopPropagation()` dans onClick pour ne pas déclencher le click parent
 *    (ex: bouton de source qui swap le player).
 */
interface PinButtonProps {
  isPinned: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
  tooltipPinned?: string;
  tooltipUnpinned?: string;
}

export const PinButton: React.FC<PinButtonProps> = ({
  isPinned,
  onToggle,
  size = 14,
  className,
  tooltipPinned,
  tooltipUnpinned,
}) => {
  const { t } = useTranslation();
  // M9 i18n : use the provided override if any, fall back to the translated
  // default. Kept `string` props so existing callers (Watch pages, HLS player
  // menu) can pass a custom French string without touching i18n files.
  const effectivePinned = tooltipPinned ?? t('settings.sourcePriority.unpin');
  const effectiveUnpinned = tooltipUnpinned ?? t('settings.sourcePriority.pin');
  const label = isPinned ? effectivePinned : effectiveUnpinned;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggle();
            }}
            className={cn(
              'inline-flex items-center justify-center rounded-full p-1',
              'transition-transform duration-150 active:scale-90 hover:scale-110',
              isPinned
                ? 'text-amber-400 hover:text-amber-500'
                : 'text-neutral-400 hover:text-neutral-100',
              className,
            )}
            aria-label={label}
            aria-pressed={isPinned}
          >
            {isPinned ? (
              <PinOff size={size} className="fill-current" />
            ) : (
              <Pin size={size} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default PinButton;

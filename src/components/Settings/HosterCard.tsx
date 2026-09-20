// src/components/Settings/HosterCard.tsx
//
// Card présentant un hoster (Filemoon, Voe, etc. ou custom `custom_*`) dans
// la section "Ordre des hosters" du panneau "Priorité des sources".
//
// Pas de switch ici : l'activation/désactivation d'un hoster built-in passe
// par la section "Extracteurs" existante de SettingsPage (source de vérité
// `extractionPrefs.m3u8`). Si le hoster est désactivé là-bas, la card apparait
// grisée avec un lien "Extracteurs →" (stub onGoToExtractors — M9 fera le
// vrai scroll-to-section). Les hosters custom (id commence par `custom_`)
// reçoivent un badge `[iframe]` pour signaler leur statut iframe-only.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { PinButton } from '../ui/PinButton';
import { HOSTER_LABELS } from '../../utils/hosterRegistry';
import type { HosterId } from '../../types/sourcePriority';

interface HosterCardProps {
  id: HosterId;
  isPinned: boolean;
  /** True si le hoster est en première position de `hosterOrder`. */
  isFirst: boolean;
  /** True si le hoster correspond à un extracteur désactivé dans Settings → Extracteurs. */
  isDisabledInExtractors: boolean;
  /** Label custom (pour les hosters `custom_*`). Si absent, fallback HOSTER_LABELS puis id brut. */
  customLabel?: string;
  /** M9 — permet de masquer le PinButton dans les contextes où il est inactif (ex: OverrideModal). */
  hidePin?: boolean;
  onTogglePin: () => void;
  /** M9 — scroll vers Settings → Extracteurs (id `#extractions`). */
  onGoToExtractors: () => void;
}

export const HosterCard: React.FC<HosterCardProps> = ({
  id, isPinned, isFirst, isDisabledInExtractors, customLabel, hidePin, onTogglePin, onGoToExtractors,
}) => {
  const { t } = useTranslation();
  const isCustom = typeof id === 'string' && id.startsWith('custom_');
  const label = customLabel ?? HOSTER_LABELS[id as keyof typeof HOSTER_LABELS] ?? id;
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-900/50 px-3 py-2 ${
        isDisabledInExtractors ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="font-medium text-white truncate">{label}</span>
        {isCustom && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30"
            title={t('settings.sourcePriority.customHosterBadgeIframeTitle')}
          >
            [{t('settings.sourcePriority.customHosterBadgeIframe')}]
          </span>
        )}
        {isFirst && (
          <span
            className="text-xs text-amber-400 font-semibold"
            aria-label={t('settings.sourcePriority.pinAriaHoster')}
          >
            {t('settings.sourcePriority.pinBadge')}
          </span>
        )}
        {isDisabledInExtractors && (
          <button
            type="button"
            onClick={onGoToExtractors}
            className="text-xs text-neutral-500 underline hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 rounded"
          >
            {t('settings.sourcePriority.hosterDisabledInExtractors')}
          </button>
        )}
      </div>
      {!hidePin && <PinButton isPinned={isPinned} onToggle={onTogglePin} />}
    </div>
  );
};

export default HosterCard;

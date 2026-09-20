// src/components/Settings/OverrideModal.tsx
//
// Milestone 6 — Dialog d'override des hosters pour une source (Films/Séries)
// ou une langue (Animes) donnée. Ouvert au clic sur le bouton ⚙ d'une
// SourceCard ou LanguageCard dans le panneau "Priorité des sources".
//
// Comportement :
//   - Switch "Utiliser l'ordre global des hosters" :
//       * ON  → `prefs.categories[cat].overrides[contextId]` est supprimé,
//               l'ordre global `hosterOrder` est utilisé pour cette source.
//       * OFF → un ordre spécifique (customOrder) est persisté dans
//               `overrides[contextId]` et prendra le pas sur l'ordre global
//               via `sortHostersByPriority` (câblé depuis M1, Task 1.5).
//   - SortableList des hosters (drag pour réordonner) visible uniquement
//     quand useGlobal = false.
//   - HosterCard affichée en mode passif : pas de pin fonctionnel (le pin
//     s'applique uniquement à l'ordre global). `isPinned={false}` +
//     `onTogglePin=noop` — le PinButton reste visible mais inactif.
//   - Le state interne (useGlobal, customOrder) est réinitialisé à chaque
//     ouverture du modal via un useEffect sur `open`.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReusableModal from '../ui/reusable-modal';
import { Button } from '../ui/button';
import { SortableList } from '../ui/SortableList';
import { HosterCard } from './HosterCard';
import {
  getSourcePriorityPrefs, updateCategory,
} from '../../utils/sourcePriorityPrefs';
import type {
  HosterId, TopLevelSourceId, LanguageId, PriorityCategory,
} from '../../types/sourcePriority';

/**
 * Switch local (même style que ceux de SourceCard/LanguageCard pour la
 * cohérence visuelle). Inliné ici pour éviter de créer un primitive
 * `src/components/ui/switch.tsx` (défèré à M9).
 */
interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  ariaLabel?: string;
}
const Switch: React.FC<SwitchProps> = ({ checked, onCheckedChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={(e) => {
      e.stopPropagation();
      onCheckedChange(!checked);
    }}
    className={`relative w-10 h-6 rounded-full transition-colors duration-200 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
      checked ? 'bg-indigo-500' : 'bg-gray-600'
    }`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`}
    />
  </button>
);

interface OverrideModalProps {
  open: boolean;
  onClose: () => void;
  category: PriorityCategory;
  contextId: TopLevelSourceId | LanguageId;
  contextLabel: string;
}

export const OverrideModal: React.FC<OverrideModalProps> = ({
  open, onClose, category, contextId, contextLabel,
}) => {
  const { t } = useTranslation();
  // État initial : si un override existe déjà pour ce contextId, on le
  // charge et useGlobal = false ; sinon useGlobal = true et l'éditeur
  // pré-rempli copie l'ordre global actuel pour permettre un override rapide.
  const initial = () => {
    const cat = getSourcePriorityPrefs().categories[category];
    const ov = (cat.overrides as Record<string, HosterId[]>)[contextId];
    return {
      useGlobal: !ov,
      customOrder: ov ?? [...cat.hosterOrder],
    };
  };
  const [useGlobal, setUseGlobal] = useState<boolean>(() => initial().useGlobal);
  const [customOrder, setCustomOrder] = useState<HosterId[]>(() => initial().customOrder);

  // Reset du state à chaque ouverture — permet au modal d'être correct si les
  // prefs ont changé ailleurs entre deux ouvertures, ou si l'utilisateur a
  // ouvert puis fermé sans enregistrer.
  useEffect(() => {
    if (!open) return;
    const { useGlobal: ug, customOrder: co } = initial();
    setUseGlobal(ug);
    setCustomOrder(co);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category, contextId]);

  const handleSave = () => {
    updateCategory(category, (c) => {
      // Cast pragmatique : `overrides` est typé Partial<Record<TopLevelSourceId | LanguageId, …>>.
      // On manipule dynamiquement (delete/set selon useGlobal) via un
      // Record<string, …> puis on le remet dans le shape typé.
      const overrides = { ...(c.overrides as Record<string, HosterId[]>) };
      if (useGlobal) {
        delete overrides[contextId];
      } else {
        overrides[contextId] = customOrder;
      }
      return { ...c, overrides } as typeof c;
    });
    onClose();
  };

  return (
    <ReusableModal
      isOpen={open}
      onClose={onClose}
      title={t('settings.sourcePriority.overrideModalTitle', { label: contextLabel })}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-white/60">
          {t('settings.sourcePriority.overrideModalDescription')}
        </p>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-white">
            {t('settings.sourcePriority.useGlobalOrder')}
          </span>
          <Switch
            checked={useGlobal}
            onCheckedChange={setUseGlobal}
            ariaLabel={t('settings.sourcePriority.useGlobalOrder')}
          />
        </div>

        {!useGlobal && (
          <div className="max-h-80 overflow-y-auto pr-1">
            <SortableList
              items={customOrder}
              onReorder={(newOrder) => setCustomOrder(newOrder as HosterId[])}
              renderItem={(id) => (
                <HosterCard
                  id={id as HosterId}
                  isPinned={false}
                  isFirst={customOrder[0] === id}
                  isDisabledInExtractors={false}
                  hidePin
                  onTogglePin={() => { /* no-op dans override */ }}
                  onGoToExtractors={() => { /* no-op dans override */ }}
                />
              )}
            />
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-white/10 mt-2">
          <Button variant="outline" onClick={onClose}>
            {t('settings.sourcePriority.overrideModalCancel')}
          </Button>
          <Button onClick={handleSave}>
            {t('settings.sourcePriority.overrideModalSave')}
          </Button>
        </div>
      </div>
    </ReusableModal>
  );
};

export default OverrideModal;

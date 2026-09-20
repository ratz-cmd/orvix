import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip';

interface TermTooltipProps {
  /** i18n key resolving to the explanation (e.g. 'help.glossary.seed'). */
  tooltipKey: string;
  /** Inherited when used through i18next <Trans> — the term text. */
  children?: React.ReactNode;
}

/**
 * Inline glossary tooltip used inside body paragraphs. Subtler than
 * FaiTooltip (no superscript footnote) so multiple can coexist in a single
 * sentence without visual noise. Keyboard-focusable for accessibility.
 *
 * Usage via i18next <Trans> numeric placeholders:
 *
 *   "bodyText": "Ton identité est une <1>phrase de 12 mots</1> (<2>BIP39</2>)."
 *
 *   <Trans i18nKey="bodyText" components={{
 *     1: <TermTooltip tooltipKey="help.glossary.seed" />,
 *     2: <TermTooltip tooltipKey="help.glossary.bip39" />,
 *   }} />
 */
const TermTooltip: React.FC<TermTooltipProps> = ({ tooltipKey, children }) => {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="underline decoration-dotted decoration-zinc-500 underline-offset-2 cursor-help"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        sideOffset={8}
        collisionPadding={12}
        className="z-[1000000000] max-w-[min(calc(100vw-24px),320px)] text-xs leading-relaxed"
      >
        {t(tooltipKey)}
      </TooltipContent>
    </Tooltip>
  );
};

export default TermTooltip;

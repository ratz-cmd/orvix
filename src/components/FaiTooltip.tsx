import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip';

// Renders an inline tooltip-wrapped mention of "FAI" / "ISP" with a
// superscript "1" footnote marker. Used inside i18next <Trans> via the
// `components={{ fai: <FaiTooltip /> }}` pattern — children come from the
// translated string (e.g. "FAI" in FR, "ISP" in EN).
const FaiTooltip: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="underline decoration-dotted underline-offset-2 cursor-help font-semibold"
        >
          {children}
          <sup className="ml-0.5 text-[0.65em] opacity-75 font-normal">1</sup>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        sideOffset={10}
        // collisionPadding keeps the tooltip at least 12px from each
        // viewport edge when Radix shifts it horizontally to fit.
        collisionPadding={12}
        // z-index bump: Sonner toasts sit at z-index 999999999 (via its
        // own stylesheet). The shadcn TooltipContent defaults to
        // z-[99999], which is hidden behind the toast. Bump to 10^9+1 so
        // the tooltip stacks above the toast when triggered from inside
        // one. Still within the CSS int32 max (2147483647).
        className="z-[1000000000] max-w-[calc(100vw-24px)] sm:max-w-xs text-xs leading-relaxed"
      >
        {t('dnsBlock.faiTooltip')}
      </TooltipContent>
    </Tooltip>
  );
};

export default FaiTooltip;

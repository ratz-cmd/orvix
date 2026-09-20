import React, { useState, useCallback, useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { PrefetchLink as Link } from '@/routing/PrefetchLink';
import { Crown, Play, Sparkles, X, ChevronRight, CheckCircle2 } from "lucide-react";
import { useAdFreePopup } from "../context/AdFreePopupContext";
import { getAdPopupMode, subscribeToAdPopupModeChanges, type AdPopupMode } from "../utils/adPopupMode";
import { getAdTargetUrls } from "../utils/adAdultMode";
import {
  SCRIPT_AD_MODE_ENABLED,
  getAdScriptState,
  loadAdScript,
  subscribeToAdScriptState,
  type AdScriptState,
} from "../utils/adScriptMode";
import { getOverlayPortalRoot } from "@/utils/overlayPortal";

interface AdFreePlayerAdsProps {
  onClose?: () => void;
  onAccept?: () => void;
  adType?: "ad1" | "ad2";
  onAdClick?: () => void;
  variant?: "player" | "download" | "livetv";
}

const AdFreePlayerAds: React.FC<AdFreePlayerAdsProps> = ({
  onClose,
  onAccept,
  adType: propAdType,
  onAdClick,
  variant = "player",
}) => {
  const {
    showAdFreePopup,
    handlePopupAccept,
  } = useAdFreePopup();

  const finalOnAccept = onAccept || handlePopupAccept;
  const shouldShow = !!onClose || showAdFreePopup;

  const [hasClicked, setHasClicked] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [popupMode, setPopupMode] = useState<AdPopupMode>(() => getAdPopupMode());
  const [scriptState, setScriptState] = useState<AdScriptState>(() => getAdScriptState());
  const scriptAdFiredRef = useRef(false);
  const scriptAcceptTimeoutRef = useRef<number | null>(null);

  // Le mode script ne s'applique qu'au popup normal avec bouton. Les modes auto
  // et click-anywhere gardent le lien direct.
  const scriptAdMode = popupMode === 'normal' && SCRIPT_AD_MODE_ENABLED;
  const scriptAdActive = scriptAdMode && scriptState !== 'failed';

  useEffect(() => subscribeToAdPopupModeChanges(setPopupMode), []);
  useEffect(() => subscribeToAdScriptState(setScriptState), []);

  useEffect(() => {
    // Reset des gardes quand le popup disparaît, pour laisser le suivant se déclencher.
    if (!shouldShow) {
      scriptAdFiredRef.current = false;
      if (scriptAcceptTimeoutRef.current !== null) {
        window.clearTimeout(scriptAcceptTimeoutRef.current);
        scriptAcceptTimeoutRef.current = null;
      }
    }
  }, [shouldShow]);

  useEffect(() => {
    if (shouldShow && scriptAdMode) loadAdScript();
  }, [shouldShow, scriptAdMode]);

  useEffect(() => {
    if (!shouldShow || popupMode !== 'normal') return;

    const lenis = (
      window as Window & { lenis?: { stop: () => void; start: () => void } }
    ).lenis;
    if (lenis) lenis.stop();

    return () => {
      if (lenis) lenis.start();
    };
  }, [shouldShow, popupMode]);

  // Ouvre toutes les cibles pub (1 fenêtre par URL) dans le même geste user.
  const openAdLinks = useCallback(() => {
    getAdTargetUrls().forEach((url) => {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }, []);

  const handleLinkClick = useCallback(() => {
    openAdLinks();
    setHasClicked(true);
    if (onAdClick) onAdClick();
  }, [openAdLinks, onAdClick]);

  const completeScriptAdGesture = useCallback(() => {
    if (scriptAcceptTimeoutRef.current !== null) {
      window.clearTimeout(scriptAcceptTimeoutRef.current);
      scriptAcceptTimeoutRef.current = null;
    }
    if (onAdClick) onAdClick();
    setHasClicked(true);
  }, [onAdClick]);

  const beginScriptAdGesture = useCallback(() => {
    if (scriptAdFiredRef.current) return;
    scriptAdFiredRef.current = true;
    loadAdScript();
    scriptAcceptTimeoutRef.current = window.setTimeout(completeScriptAdGesture, 700);
  }, [completeScriptAdGesture]);

  // Le popunder peut consommer le onClick React. La capture pointerdown prépare
  // la détection avant les listeners document du script.
  useEffect(() => {
    if (!shouldShow || !scriptAdActive || hasClicked) return;
    const onCapturePointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest('[data-ad-view-button]')) beginScriptAdGesture();
    };
    window.addEventListener('pointerdown', onCapturePointer, true);
    return () => window.removeEventListener('pointerdown', onCapturePointer, true);
  }, [shouldShow, scriptAdActive, hasClicked, beginScriptAdGesture]);

  // Fermeture avec animation de sortie avant de notifier le parent
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      finalOnAccept();
    }, 300);
  }, [finalOnAccept]);

  // Titre contextuel
  const modalTitle = hasClicked
    ? variant === "download"
      ? "Lien prêt !"
      : variant === "livetv"
        ? "Direct débloqué !"
        : "Lecteur prêt !"
    : variant === "download"
      ? "Regarde la pub pour télécharger"
      : variant === "livetv"
        ? "Regarde la pub pour accéder au direct"
        : "Regarde la pub pour accéder au contenu";

  // Description contextuelle
  const modalDescription = hasClicked
    ? variant === "download"
      ? "Le lien de téléchargement a été débloqué avec succès !"
      : variant === "livetv"
        ? "Le flux TV en direct est débloqué et synchronisé !"
        : "Merci de soutenir la plateforme ! Ton lecteur est synchronisé et prêt."
    : variant === "download"
      ? "Ce geste simple permet de financer nos serveurs tout en gardant le téléchargement gratuit."
      : variant === "livetv"
        ? "Ce geste simple permet d'accéder à l'ensemble des chaînes en direct gratuitement."
        : "Ce geste simple permet de maintenir Orvix 100% gratuit, sans inscription ni abonnement.";

  // Label bouton principal
  const buttonLabel = hasClicked
    ? variant === "download"
      ? "Télécharger maintenant"
      : variant === "livetv"
        ? "Lancer le direct"
        : "Lancer la lecture"
    : variant === "download"
      ? "Voir la pub & débloquer"
      : variant === "livetv"
        ? "Voir la pub & regarder"
        : "Regarder la pub";

  if (!shouldShow) return null;

  // Option B : Toujours afficher le dialogue modal à l'écran

  return (
    <DialogPrimitive.Root
      open={!isClosing}
      onOpenChange={(open) => {
        if (!open && hasClicked) {
          handleClose();
        }
      }}
    >
      <DialogPrimitive.Portal container={getOverlayPortalRoot()}>
        {/* Overlay avec flou cinématique sombre */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300"
          onClick={(e) => {
            if (e.target === e.currentTarget && hasClicked) {
              handleClose();
            }
          }}
        />

        {/* Contenu du dialog - Design Orvix Dark OLED Glassmorphism */}
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => {
            if (!hasClicked) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!hasClicked) e.preventDefault();
          }}
          data-lenis-prevent
          className="fixed left-[50%] top-[50%] z-50 w-[calc(100%-2rem)] max-w-[440px] translate-x-[-50%] translate-y-[-50%] rounded-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto bg-gradient-to-b from-[#0e1626] via-[#090d16] to-[#05070d] border border-blue-500/20 shadow-2xl shadow-blue-950/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-300"
          style={{
            pointerEvents: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Bouton fermer discret (uniquement disponible après interaction pub) */}
          {hasClicked && (
            <DialogPrimitive.Close
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-full p-2 text-white/40 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Fermer</span>
            </DialogPrimitive.Close>
          )}

          {/* Badge & Icône Orvix */}
          <div className="flex flex-col items-center justify-center pt-2 pb-3 px-2 text-center">
            {/* Badge Orvix */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold tracking-wider uppercase mb-4 shadow-sm shadow-blue-500/10">
              <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span>Accès Gratuit Orvix</span>
            </div>

            {/* Glowing Icon Container */}
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg transition-all duration-300 ${
              hasClicked
                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-emerald-500/20"
                : "bg-blue-500/15 border border-blue-500/30 text-blue-400 shadow-blue-500/20"
            }`}>
              {hasClicked ? (
                <CheckCircle2 className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 fill-current translate-x-0.5" />
              )}
            </div>

            {/* Titre & Description */}
            <DialogPrimitive.Title className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2 text-center">
              {modalTitle}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-xs sm:text-sm text-slate-300 font-normal text-center leading-relaxed max-w-sm">
              {modalDescription}
            </DialogPrimitive.Description>
          </div>

          {/* Boutons d'action */}
          <div className="flex flex-col items-center gap-3 px-2 pt-2 pb-2">
            {hasClicked ? (
              <button
                onClick={handleClose}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:via-emerald-400 hover:to-teal-500 text-white font-semibold text-base shadow-lg shadow-emerald-600/30 hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950"
                autoFocus
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{buttonLabel}</span>
              </button>
            ) : (
              <>
                <button
                  data-ad-view-button
                  onClick={
                    scriptAdMode
                      ? scriptAdActive
                        ? beginScriptAdGesture
                        : completeScriptAdGesture
                      : handleLinkClick
                  }
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:via-blue-400 hover:to-indigo-500 text-white font-semibold text-base shadow-lg shadow-blue-600/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950"
                  autoFocus
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{buttonLabel}</span>
                </button>
                <span className="text-xs text-slate-400 text-center">
                  Une page s'ouvrira dans un nouvel onglet
                </span>
              </>
            )}

            {/* Section VIP Épurée Orvix (aucune mention d'extension ou d'application mobile) */}
            {!hasClicked && (
              <div className="w-full mt-3 pt-4 border-t border-white/10">
                <Link
                  to="/vip"
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 hover:border-amber-400/50 hover:bg-amber-500/15 text-amber-300 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                      <Crown className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <span className="block text-xs font-semibold text-amber-200 group-hover:text-amber-100 transition-colors">
                        Accès VIP sans publicité
                      </span>
                      <span className="block text-[11px] text-amber-300/70">
                        Lecture directe et illimitée
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-400/60 group-hover:text-amber-300 group-hover:translate-x-0.5 transition-all" />
                </Link>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default AdFreePlayerAds;

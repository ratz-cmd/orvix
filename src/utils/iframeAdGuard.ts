// src/utils/iframeAdGuard.ts
//
// Bouclier anti-popups et anti-redirections pour les iframes externes résiduelles.
// Neutralise les tentatives des régies publicitaires d'ouvrir des popups (window.open)
// ou de voler la navigation de la page principale (top location hijacking),
// tout en préservant les actions intentionnelles de l'utilisateur.

import { useEffect, useRef } from 'react';

// Domaines légitimes autorisés pour window.open (partage, TMDB, dons, discord, etc.)
const ALLOWED_POPUP_PATTERNS = [
  /^https?:\/\/([a-z0-9-]+\.)?discord\.(gg|com)/i,
  /^https?:\/\/([a-z0-9-]+\.)?themoviedb\.org/i,
  /^https?:\/\/([a-z0-9-]+\.)?imdb\.com/i,
  /^https?:\/\/([a-z0-9-]+\.)?paypal\.com/i,
  /^https?:\/\/([a-z0-9-]+\.)?github\.com/i,
  /^https?:\/\/([a-z0-9-]+\.)?t\.me/i,
  /^https?:\/\/([a-z0-9-]+\.)?telegram\.org/i,
  /^https?:\/\/([a-z0-9-]+\.)?frembed\.surf/i,
  /^https?:\/\/([a-z0-9-]+\.)?videasy\.net/i,
];

export function isAllowedPopupUrl(url?: string | URL | null): boolean {
  if (!url) return false;
  const str = url.toString().trim();
  if (!str || str === 'about:blank' || str === 'javascript:void(0)') return false;
  return ALLOWED_POPUP_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Hook React activant le bouclier anti-popups lorsqu'un lecteur iframe externe est affiché.
 *
 * @param active Vrai lorsque le composant affiche une iframe externe (ex: embedUrl non null).
 */
export function useIframeAdGuard(active: boolean = true) {
  const isIntentionalClickRef = useRef(false);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    const originalOpen = window.open;

    // Intercepteur de window.open : bloque les popups publicitaires automatiques
    // déclenchés au clic sur l'iframe
    window.open = function customOpen(
      url?: string | URL,
      target?: string,
      features?: string,
    ): Window | null {
      const urlStr = url ? url.toString() : '';

      // Si c'est une action intentionnelle explicite de l'utilisateur (ex: bouton "ouvrir dans un nouvel onglet")
      if (isIntentionalClickRef.current) {
        isIntentionalClickRef.current = false;
        return originalOpen.call(window, url, target, features);
      }

      // Si l'URL appartient à un domaine de confiance
      if (isAllowedPopupUrl(urlStr)) {
        return originalOpen.call(window, url, target, features);
      }

      console.warn('[IframeAdGuard] 🛡️ Popup publicitaire bloqué :', urlStr || 'about:blank');
      return null;
    };

    // Empêcher les iframes de forcer une redirection de la page mère (top navigation hijacking)
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Si l'utilisateur n'a pas déclenché intentionnellement une navigation
      if (!isIntentionalClickRef.current) {
        // Certains navigateurs honorent le blocage d'un unload sauvage
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.open = originalOpen;
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [active]);

  // Déclencheur pour les actions utilisateur explicites (bouton externe dans l'UI d'Orvix)
  const executeAllowedAction = (action: () => void) => {
    isIntentionalClickRef.current = true;
    try {
      action();
    } finally {
      // Réinitialisation sécurisée
      setTimeout(() => {
        isIntentionalClickRef.current = false;
      }, 500);
    }
  };

  return { executeAllowedAction };
}

import React, { useEffect } from 'react';
import { getFrembedBase } from '../utils/frembedConfig';

interface VideoPlayerProps {
  movieId: string;
  /** Conservé pour compatibilité d'appel : ce lecteur n'en fait rien. */
  nextMovie?: unknown;
}

/**
 * Lecteur Frembed (historique).
 *
 * ⚠️ Cette iframe ne doit **jamais** porter d'attribut `sandbox`. Un bac à
 * sable, même « permissif » (`allow-scripts allow-same-origin`), retire au
 * lecteur distant :
 *   - `allow-popups` : beaucoup de lecteurs ouvrent une fenêtre pour démarrer
 *     la diffusion, ou pour l'étape anti-bot ;
 *   - `allow-forms` / `allow-modals` : écrans d'âge, choix de serveur ;
 *   - `allow-presentation` : Picture-in-Picture ;
 *   - `allow-downloads`, `allow-top-navigation-by-user-activation` : boutons
 *     « télécharger » / « ouvrir la source », encore utilisés par Frembed.
 * Résultat observé : le lecteur se charge mais refuse de lancer la vidéo.
 * On délègue donc la sécurité à l'`allow` explicite + au garde anti-popups
 * (`iframeAdGuard.ts`), pas au bac à sable.
 */
const VideoPlayer: React.FC<VideoPlayerProps> = ({ movieId, nextMovie }) => {
  useEffect(() => {
    // Ce lecteur est servi sur une autre origine : on ne peut pas lire ni
    // modifier son DOM. L'ancien code tentait d'injecter un script anti-devtool
    // dans `contentWindow.document`, ce qui levait une erreur de sécurité et
    // laissait le lecteur dans un état indéfini. On se contente de vérifier
    // que la frame est bien montée.
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-orvix-player="frembed"]');
    if (!iframe) {
      console.warn('[VideoPlayer] Iframe Frembed introuvable au montage');
    }
    void nextMovie;
  }, [nextMovie]);

  return (
    <iframe
      data-orvix-player="frembed"
      src={`${getFrembedBase()}/api/film.php?id=${movieId}`}
      width="100%"
      height="500px"
      frameBorder="0"
      allowFullScreen
      scrolling="no"
      style={{ overflow: 'hidden', border: 0 }}
      // Pas de `sandbox` : voir le commentaire du composant.
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      title="Lecteur Orvix"
    />
  );
};

export default VideoPlayer;

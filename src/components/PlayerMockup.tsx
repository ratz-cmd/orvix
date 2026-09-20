import { useTranslation } from 'react-i18next';
import { ImageZoom, Image } from './ui/image-zoom';

interface PlayerMockupProps {
  variant?: 'hls' | 'embed';
  annotationKind?: 'gear' | null;
}

const PlayerMockup: React.FC<PlayerMockupProps> = ({
  annotationKind = null,
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-white/10 bg-black shadow-lg">
      <ImageZoom zoomScale={2.5} zoomOnHover={false}>
        <div className="relative w-full h-full">
          <Image
            src="/help/changer-de-lecteur.png"
            alt=""
            objectFit="contain"
            loading="lazy"
            decoding="async"
          />
          {annotationKind === 'gear' && (
            <span
              className="absolute top-[30%] right-[8%] text-blue-500 font-bold text-sm sm:text-lg drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] pointer-events-none whitespace-nowrap"
              aria-hidden="true"
            >
              {t('help.changerLecteur.arrowLabel')}
            </span>
          )}
        </div>
      </ImageZoom>
    </div>
  );
};

export default PlayerMockup;

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import PlayerMockup from '../../components/PlayerMockup';
import TermTooltip from '../../components/TermTooltip';

const ChangerLecteurPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.changerLecteur.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      titleKey: 'help.changerLecteur.introTitle',
      bodyKey: 'help.changerLecteur.introBody',
      components: {
        1: <TermTooltip tooltipKey="help.glossary.hls" />,
        2: <TermTooltip tooltipKey="help.glossary.embed" />,
      },
    },
    {
      kind: 'visual',
      render: () => <PlayerMockup variant="hls" annotationKind="gear" />,
      captionKey: 'help.changerLecteur.mockupCaption',
    },
    {
      kind: 'text',
      titleKey: 'help.changerLecteur.diffTitle',
      bodyKey: 'help.changerLecteur.diffHlsBody',
    },
    {
      kind: 'text',
      titleKey: 'help.changerLecteur.diffEmbedTitle',
      bodyKey: 'help.changerLecteur.diffEmbedBody',
    },
    {
      kind: 'steps',
      titleKey: 'help.changerLecteur.stepsTitle',
      stepKeys: [
        'help.changerLecteur.step1',
        'help.changerLecteur.step2',
        'help.changerLecteur.step3',
      ],
    },
  ];

  return (
    <TutoLayout
      icon={<SlidersHorizontal className="w-10 h-10 text-blue-400" />}
      title={t('help.changerLecteur.title')}
      heroSub={t('help.changerLecteur.heroSub')}
      sections={sections}
    />
  );
};

export default ChangerLecteurPage;

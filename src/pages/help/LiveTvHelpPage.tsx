import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tv } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TutoLink from '../../components/TutoLink';

const LiveTvHelpPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.liveTv.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      bodyKey: 'help.liveTv.introBody',
      components: {
        1: <TutoLink to="/live-tv" />,
      },
    },
    {
      kind: 'text',
      titleKey: 'help.liveTv.sourcesTitle',
      bodyKey: 'help.liveTv.sourcesBody',
      components: {
        1: <TutoLink to="/vip" />,
      },
    },
    {
      kind: 'table',
      titleKey: 'help.liveTv.categoriesTitle',
      introKey: 'help.liveTv.categoriesIntro',
      headerKeys: [
        'help.liveTv.catHeaderCategory',
        'help.liveTv.catHeaderExample',
      ],
      rowKeys: [
        ['help.liveTv.catGeneraliste', 'help.liveTv.catGeneralisteExample'],
        ['help.liveTv.catCinema', 'help.liveTv.catCinemaExample'],
        ['help.liveTv.catInfo', 'help.liveTv.catInfoExample'],
        ['help.liveTv.catSport', 'help.liveTv.catSportExample'],
        ['help.liveTv.catEnfants', 'help.liveTv.catEnfantsExample'],
        ['help.liveTv.catMusique', 'help.liveTv.catMusiqueExample'],
        ['help.liveTv.catDocu', 'help.liveTv.catDocuExample'],
      ],
    },
    {
      kind: 'text',
      titleKey: 'help.liveTv.matchesTitle',
      bodyKey: 'help.liveTv.matchesBody',
    },
    {
      kind: 'text',
      titleKey: 'help.liveTv.favoritesTitle',
      bodyKey: 'help.liveTv.favoritesBody',
    },
    {
      kind: 'text',
      titleKey: 'help.liveTv.limitsTitle',
      bodyKey: 'help.liveTv.limitsBody',
      components: {
        1: <TutoLink to="/help/dns" />,
      },
    },
  ];

  return (
    <TutoLayout
      icon={<Tv className="w-10 h-10 text-purple-400" />}
      title={t('help.liveTv.title')}
      heroSub={t('help.liveTv.heroSub')}
      sections={sections}
    />
  );
};

export default LiveTvHelpPage;

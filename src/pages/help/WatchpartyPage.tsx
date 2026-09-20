import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, AlertTriangle } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TermTooltip from '../../components/TermTooltip';

const WatchpartyPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.watchparty.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      bodyKey: 'help.watchparty.introBody',
      components: {
        1: <TermTooltip tooltipKey="help.glossary.wasm" />,
      },
    },
    {
      kind: 'steps',
      titleKey: 'help.watchparty.howTitle',
      stepKeys: [
        'help.watchparty.step1',
        'help.watchparty.step2',
        'help.watchparty.step3',
      ],
    },
    {
      kind: 'text',
      titleKey: 'help.watchparty.constraintsTitle',
      bodyKey: 'help.watchparty.constraintsBody',
      titleIcon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    },
    {
      kind: 'text',
      titleKey: 'help.watchparty.incompatTitle',
      bodyKey: 'help.watchparty.incompatBody',
      titleIcon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    },
    { kind: 'text', bodyKey: 'help.watchparty.nightflixNoteBody' },
    { kind: 'text', titleKey: 'help.watchparty.syncTitle', bodyKey: 'help.watchparty.syncBody' },
  ];

  return (
    <TutoLayout
      icon={<Users className="w-10 h-10 text-orange-400" />}
      title={t('help.watchparty.title')}
      heroSub={t('help.watchparty.heroSub')}
      sections={sections}
    />
  );
};

export default WatchpartyPage;

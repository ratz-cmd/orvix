import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Unlock, AlertTriangle } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TutoLink from '../../components/TutoLink';

const DebridHelpPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.debrid.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      bodyKey: 'help.debrid.introBody',
      components: {
        1: <TutoLink to="/debrid" />,
      },
    },
    {
      kind: 'text',
      titleKey: 'help.debrid.vipTitle',
      bodyKey: 'help.debrid.vipBody',
      titleIcon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      components: {
        1: <TutoLink to="/vip" />,
      },
    },
    {
      kind: 'text',
      titleKey: 'help.debrid.supportedTitle',
      bodyKey: 'help.debrid.supportedBody',
    },
    {
      kind: 'text',
      titleKey: 'help.debrid.providersTitle',
      bodyKey: 'help.debrid.providersBody',
    },
    {
      kind: 'steps',
      titleKey: 'help.debrid.stepsTitle',
      stepKeys: [
        'help.debrid.step1',
        'help.debrid.step2',
        'help.debrid.step3',
        'help.debrid.step4',
      ],
    },
    {
      kind: 'text',
      titleKey: 'help.debrid.historyTitle',
      bodyKey: 'help.debrid.historyBody',
    },
    {
      kind: 'text',
      titleKey: 'help.debrid.limitsTitle',
      bodyKey: 'help.debrid.limitsBody',
    },
  ];

  return (
    <TutoLayout
      icon={<Unlock className="w-10 h-10 text-orange-400" />}
      title={t('help.debrid.title')}
      heroSub={t('help.debrid.heroSub')}
      sections={sections}
    />
  );
};

export default DebridHelpPage;

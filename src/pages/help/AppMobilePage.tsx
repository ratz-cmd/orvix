import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TermTooltip from '../../components/TermTooltip';
import TutoLink from '../../components/TutoLink';

const AppMobilePage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.appMobile.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      bodyKey: 'help.appMobile.introBody',
      components: {
        1: <TutoLink to="/app" />,
      },
    },
    {
      kind: 'text',
      titleKey: 'help.appMobile.downloadTitle',
      bodyKey: 'help.appMobile.downloadBody',
      components: {
        1: <TermTooltip tooltipKey="help.glossary.apk" />,
        2: <TutoLink to="/app" />,
      },
    },
    {
      kind: 'steps',
      titleKey: 'help.appMobile.installTitle',
      stepKeys: [
        'help.appMobile.step1',
        'help.appMobile.step2',
        'help.appMobile.step3',
      ],
    },
    { kind: 'text', titleKey: 'help.appMobile.updatesTitle', bodyKey: 'help.appMobile.updatesBody' },
    { kind: 'text', titleKey: 'help.appMobile.iosTitle', bodyKey: 'help.appMobile.iosBody' },
  ];

  return (
    <TutoLayout
      icon={<Smartphone className="w-10 h-10 text-green-400" />}
      title={t('help.appMobile.title')}
      heroSub={t('help.appMobile.heroSub')}
      sections={sections}
    />
  );
};

export default AppMobilePage;

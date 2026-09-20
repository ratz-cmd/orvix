import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Cast } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TutoLink from '../../components/TutoLink';

const ChromecastPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.chromecast.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    { kind: 'text', bodyKey: 'help.chromecast.introBody' },
    {
      kind: 'text',
      titleKey: 'help.chromecast.chromecastTitle',
      bodyKey: 'help.chromecast.chromecastBody',
      components: {
        1: <TutoLink to="/app" />,
      },
    },
    { kind: 'text', titleKey: 'help.chromecast.airplayTitle', bodyKey: 'help.chromecast.airplayBody' },
    { kind: 'text', titleKey: 'help.chromecast.limitsTitle', bodyKey: 'help.chromecast.limitsBody' },
  ];

  return (
    <TutoLayout
      icon={<Cast className="w-10 h-10 text-blue-400" />}
      title={t('help.chromecast.title')}
      heroSub={t('help.chromecast.heroSub')}
      sections={sections}
    />
  );
};

export default ChromecastPage;

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TermTooltip from '../../components/TermTooltip';

const InstallerPwaPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.installerPwa.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      bodyKey: 'help.installerPwa.introBody',
      components: {
        1: <TermTooltip tooltipKey="help.glossary.pwa" />,
      },
    },
    { kind: 'text', titleKey: 'help.installerPwa.iosTitle', bodyKey: 'help.installerPwa.iosBody' },
    { kind: 'text', titleKey: 'help.installerPwa.androidTitle', bodyKey: 'help.installerPwa.androidBody' },
    { kind: 'text', titleKey: 'help.installerPwa.desktopTitle', bodyKey: 'help.installerPwa.desktopBody' },
    { kind: 'text', titleKey: 'help.installerPwa.advantagesTitle', bodyKey: 'help.installerPwa.advantagesBody' },
  ];

  return (
    <TutoLayout
      icon={<Download className="w-10 h-10 text-green-400" />}
      title={t('help.installerPwa.title')}
      heroSub={t('help.installerPwa.heroSub')}
      sections={sections}
    />
  );
};

export default InstallerPwaPage;

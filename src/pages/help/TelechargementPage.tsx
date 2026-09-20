import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDriveDownload } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TutoLink from '../../components/TutoLink';

const TelechargementPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.telechargement.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    { kind: 'text', bodyKey: 'help.telechargement.introBody' },
    {
      kind: 'steps',
      titleKey: 'help.telechargement.stepsTitle',
      stepKeys: [
        'help.telechargement.step1',
        'help.telechargement.step2',
        'help.telechargement.step3',
        'help.telechargement.step4',
      ],
    },
    {
      kind: 'text',
      titleKey: 'help.telechargement.hostsTitle',
      bodyKey: 'help.telechargement.hostsBody',
    },
    {
      kind: 'text',
      titleKey: 'help.telechargement.debridTitle',
      bodyKey: 'help.telechargement.debridBody',
      components: {
        1: <TutoLink to="/help/debrid" />,
        2: <TutoLink to="/vip" />,
      },
    },
    {
      kind: 'text',
      titleKey: 'help.telechargement.seriesTitle',
      bodyKey: 'help.telechargement.seriesBody',
    },
    {
      kind: 'text',
      titleKey: 'help.telechargement.limitsTitle',
      bodyKey: 'help.telechargement.limitsBody',
    },
  ];

  return (
    <TutoLayout
      icon={<HardDriveDownload className="w-10 h-10 text-blue-400" />}
      title={t('help.telechargement.title')}
      heroSub={t('help.telechargement.heroSub')}
      sections={sections}
    />
  );
};

export default TelechargementPage;

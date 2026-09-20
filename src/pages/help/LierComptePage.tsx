import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LinkIcon } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';

const LierComptePage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.lierCompte.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    { kind: 'text', bodyKey: 'help.lierCompte.introBody' },
    {
      kind: 'steps',
      titleKey: 'help.lierCompte.howTitle',
      stepKeys: [
        'help.lierCompte.step1',
        'help.lierCompte.step2',
        'help.lierCompte.step3',
        'help.lierCompte.step4',
      ],
    },
    { kind: 'text', titleKey: 'help.lierCompte.limitsTitle', bodyKey: 'help.lierCompte.limitsBody' },
    { kind: 'text', titleKey: 'help.lierCompte.securityTitle', bodyKey: 'help.lierCompte.securityBody' },
  ];

  return (
    <TutoLayout
      icon={<LinkIcon className="w-10 h-10 text-purple-400" />}
      title={t('help.lierCompte.title')}
      heroSub={t('help.lierCompte.heroSub')}
      sections={sections}
    />
  );
};

export default LierComptePage;

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Captions } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';

const SousTitresPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.sousTitres.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    { kind: 'text', titleKey: 'help.sousTitres.introTitle', bodyKey: 'help.sousTitres.introBody' },
    { kind: 'text', titleKey: 'help.sousTitres.hlsTitle', bodyKey: 'help.sousTitres.hlsBody' },
    { kind: 'text', titleKey: 'help.sousTitres.externalTitle', bodyKey: 'help.sousTitres.externalBody' },
    { kind: 'text', titleKey: 'help.sousTitres.translateTitle', bodyKey: 'help.sousTitres.translateBody' },
    { kind: 'text', titleKey: 'help.sousTitres.embedTitle', bodyKey: 'help.sousTitres.embedBody' },
  ];

  return (
    <TutoLayout
      icon={<Captions className="w-10 h-10 text-blue-400" />}
      title={t('help.sousTitres.title')}
      heroSub={t('help.sousTitres.heroSub')}
      sections={sections}
    />
  );
};

export default SousTitresPage;

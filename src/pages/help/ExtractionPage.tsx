import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';

const ExtractionPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.extraction.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    { kind: 'text', bodyKey: 'help.extraction.introBody' },
    {
      kind: 'text',
      titleKey: 'help.extraction.whereTitle',
      bodyKey: 'help.extraction.whereBody',
    },
    {
      kind: 'steps',
      titleKey: 'help.extraction.stepsTitle',
      stepKeys: [
        'help.extraction.step1',
        'help.extraction.step2',
        'help.extraction.step3',
      ],
    },
    {
      kind: 'text',
      titleKey: 'help.extraction.cacheTitle',
      bodyKey: 'help.extraction.cacheBody',
    },
    {
      kind: 'text',
      titleKey: 'help.extraction.noExtensionTitle',
      bodyKey: 'help.extraction.noExtensionBody',
    },
    {
      kind: 'text',
      titleKey: 'help.extraction.limitsTitle',
      bodyKey: 'help.extraction.limitsBody',
    },
  ];

  return (
    <TutoLayout
      icon={<Filter className="w-10 h-10 text-orange-400" />}
      title={t('help.extraction.title')}
      heroSub={t('help.extraction.heroSub')}
      sections={sections}
    />
  );
};

export default ExtractionPage;

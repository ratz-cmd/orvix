import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ListOrdered, GripVertical, Pin, Settings, RotateCcw } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';

const inlineIconClass =
  'inline-block w-4 h-4 align-text-bottom mx-0.5 text-zinc-200';

const PrioriteSourcesPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.prioriteSources.title')} — Orvix`;
  }, [t]);

  const stepIcons = {
    1: <GripVertical className={inlineIconClass} />,
    2: <Pin className={inlineIconClass} />,
    3: <Settings className={inlineIconClass} />,
  };

  const sections: TutoSection[] = [
    { kind: 'text', bodyKey: 'help.prioriteSources.introBody' },
    {
      kind: 'text',
      titleKey: 'help.prioriteSources.whereTitle',
      bodyKey: 'help.prioriteSources.whereBody',
    },
    {
      kind: 'steps',
      titleKey: 'help.prioriteSources.stepsTitle',
      stepKeys: [
        'help.prioriteSources.step1',
        'help.prioriteSources.step2',
        'help.prioriteSources.step3',
        'help.prioriteSources.step4',
      ],
      components: stepIcons,
    },
    {
      kind: 'text',
      titleKey: 'help.prioriteSources.pinTitle',
      bodyKey: 'help.prioriteSources.pinBody',
      components: { 1: <Pin className={inlineIconClass} /> },
    },
    {
      kind: 'text',
      titleKey: 'help.prioriteSources.overrideTitle',
      bodyKey: 'help.prioriteSources.overrideBody',
      components: { 1: <Settings className={inlineIconClass} /> },
    },
    {
      kind: 'text',
      titleKey: 'help.prioriteSources.advancedTitle',
      bodyKey: 'help.prioriteSources.advancedBody',
    },
    {
      kind: 'text',
      titleKey: 'help.prioriteSources.resetTitle',
      bodyKey: 'help.prioriteSources.resetBody',
      components: { 1: <RotateCcw className={inlineIconClass} /> },
    },
    {
      kind: 'text',
      titleKey: 'help.prioriteSources.syncTitle',
      bodyKey: 'help.prioriteSources.syncBody',
    },
    {
      kind: 'text',
      titleKey: 'help.prioriteSources.limitsTitle',
      bodyKey: 'help.prioriteSources.limitsBody',
    },
  ];

  return (
    <TutoLayout
      icon={<ListOrdered className="w-10 h-10 text-blue-400" />}
      title={t('help.prioriteSources.title')}
      heroSub={t('help.prioriteSources.heroSub')}
      sections={sections}
    />
  );
};

export default PrioriteSourcesPage;

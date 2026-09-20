import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, AlertTriangle } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TermTooltip from '../../components/TermTooltip';

const ComptePage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.compte.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      titleKey: 'help.compte.whyTitle',
      bodyKey: 'help.compte.whyBody',
      components: {
        1: <TermTooltip tooltipKey="help.glossary.seed" />,
        2: <TermTooltip tooltipKey="help.glossary.bip39" />,
      },
    },
    {
      kind: 'steps',
      titleKey: 'help.compte.stepsTitle',
      stepKeys: [
        'help.compte.step1',
        'help.compte.step2',
        'help.compte.step3',
        'help.compte.step4',
      ],
    },
    {
      kind: 'text',
      titleKey: 'help.compte.warningTitle',
      bodyKey: 'help.compte.warningBody',
      titleIcon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    },
    { kind: 'text', titleKey: 'help.compte.oauthTitle', bodyKey: 'help.compte.oauthBody' },
  ];

  return (
    <TutoLayout
      icon={<UserPlus className="w-10 h-10 text-green-400" />}
      title={t('help.compte.title')}
      heroSub={t('help.compte.heroSub')}
      sections={sections}
    />
  );
};

export default ComptePage;

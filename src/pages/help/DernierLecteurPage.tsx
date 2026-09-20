import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { History, ToggleRight, ListOrdered } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';

const inlineIconClass =
  'inline-block w-4 h-4 align-text-bottom mx-0.5 text-zinc-200';

const DernierLecteurPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.dernierLecteur.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    { kind: 'text', bodyKey: 'help.dernierLecteur.introBody' },
    {
      kind: 'text',
      titleKey: 'help.dernierLecteur.howTitle',
      bodyKey: 'help.dernierLecteur.howBody',
      components: { 1: <ToggleRight className={inlineIconClass} /> },
    },
    {
      kind: 'text',
      titleKey: 'help.dernierLecteur.priorityTitle',
      bodyKey: 'help.dernierLecteur.priorityBody',
      components: { 1: <ListOrdered className={inlineIconClass} /> },
    },
    {
      kind: 'text',
      titleKey: 'help.dernierLecteur.fallbackTitle',
      bodyKey: 'help.dernierLecteur.fallbackBody',
    },
    {
      kind: 'text',
      titleKey: 'help.dernierLecteur.limitsTitle',
      bodyKey: 'help.dernierLecteur.limitsBody',
    },
  ];

  return (
    <TutoLayout
      icon={<History className="w-10 h-10 text-indigo-400" />}
      title={t('help.dernierLecteur.title')}
      heroSub={t('help.dernierLecteur.heroSub')}
      sections={sections}
    />
  );
};

export default DernierLecteurPage;

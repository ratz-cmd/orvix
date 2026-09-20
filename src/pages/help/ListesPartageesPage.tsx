import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { List } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TutoLink from '../../components/TutoLink';

const ListesPartageesPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.listesPartagees.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    { kind: 'text', bodyKey: 'help.listesPartagees.introBody' },
    {
      kind: 'steps',
      titleKey: 'help.listesPartagees.createTitle',
      stepKeys: [
        'help.listesPartagees.step1',
        'help.listesPartagees.step2',
        'help.listesPartagees.step3',
      ],
    },
    { kind: 'text', titleKey: 'help.listesPartagees.shareTitle', bodyKey: 'help.listesPartagees.shareBody' },
    { kind: 'text', titleKey: 'help.listesPartagees.collabTitle', bodyKey: 'help.listesPartagees.collabBody' },
    {
      kind: 'text',
      titleKey: 'help.listesPartagees.catalogTitle',
      bodyKey: 'help.listesPartagees.catalogBody',
      components: {
        1: <TutoLink to="/list-catalog" />,
      },
    },
  ];

  return (
    <TutoLayout
      icon={<List className="w-10 h-10 text-purple-400" />}
      title={t('help.listesPartagees.title')}
      heroSub={t('help.listesPartagees.heroSub')}
      sections={sections}
    />
  );
};

export default ListesPartageesPage;

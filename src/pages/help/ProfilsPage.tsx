import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users2, AlertTriangle, Baby } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';
import TutoLink from '../../components/TutoLink';

const ProfilsPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.profils.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      bodyKey: 'help.profils.introBody',
      components: {
        1: <TutoLink to="/manage-profiles" />,
      },
    },
    {
      kind: 'steps',
      titleKey: 'help.profils.createTitle',
      stepKeys: [
        'help.profils.step1',
        'help.profils.step2',
        'help.profils.step3',
        'help.profils.step4',
      ],
    },
    {
      kind: 'table',
      titleKey: 'help.profils.ageTableTitle',
      introKey: 'help.profils.ageTableIntro',
      headerKeys: ['help.profils.ageHeaderValue', 'help.profils.ageHeaderMeaning'],
      rowKeys: [
        ['help.profils.age0Value', 'help.profils.age0Meaning'],
        ['help.profils.age7Value', 'help.profils.age7Meaning'],
        ['help.profils.age12Value', 'help.profils.age12Meaning'],
        ['help.profils.age16Value', 'help.profils.age16Meaning'],
        ['help.profils.age18Value', 'help.profils.age18Meaning'],
      ],
      noteKey: 'help.profils.ageTableNote',
    },
    {
      kind: 'text',
      titleKey: 'help.profils.kidsTitle',
      bodyKey: 'help.profils.kidsBody',
      titleIcon: <Baby className="w-5 h-5 text-pink-400" />,
    },
    {
      kind: 'text',
      titleKey: 'help.profils.switchTitle',
      bodyKey: 'help.profils.switchBody',
      components: {
        1: <TutoLink to="/profile-selection" />,
      },
    },
    {
      kind: 'text',
      titleKey: 'help.profils.limitsTitle',
      bodyKey: 'help.profils.limitsBody',
      titleIcon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    },
  ];

  return (
    <TutoLayout
      icon={<Users2 className="w-10 h-10 text-pink-400" />}
      title={t('help.profils.title')}
      heroSub={t('help.profils.heroSub')}
      sections={sections}
    />
  );
};

export default ProfilsPage;

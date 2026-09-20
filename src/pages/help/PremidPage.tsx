import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, AlertTriangle } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';

const PREMID_HOME = 'https://premid.app/fr';
const PREMID_ORVIX_LIBRARY = 'https://premid.app/fr/library/orvix';
const PREMID_CHROME = 'https://chromewebstore.google.com/detail/premid/agnpmnnelkhngjfiibjjljipjmlhbecf';
const PREMID_FIREFOX = 'https://addons.mozilla.org/fr/firefox/addon/premid/';

const externalLink = (href: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="font-medium text-indigo-400 hover:text-indigo-300 underline underline-offset-2 decoration-indigo-500/40 hover:decoration-indigo-400"
  />
);

const PremidPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.premid.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      bodyKey: 'help.premid.introBody',
      components: {
        1: externalLink(PREMID_HOME),
      },
    },
    {
      kind: 'text',
      titleKey: 'help.premid.installTitle',
      bodyKey: 'help.premid.installBody',
      components: {
        1: externalLink(PREMID_CHROME),
        2: externalLink(PREMID_FIREFOX),
      },
    },
    {
      kind: 'steps',
      titleKey: 'help.premid.stepsTitle',
      stepKeys: [
        'help.premid.step1',
        'help.premid.step2',
        'help.premid.step3',
        'help.premid.step4',
      ],
    },
    {
      kind: 'text',
      titleKey: 'help.premid.orvixPresenceTitle',
      bodyKey: 'help.premid.orvixPresenceBody',
      components: {
        1: externalLink(PREMID_ORVIX_LIBRARY),
      },
    },
    {
      kind: 'text',
      titleKey: 'help.premid.limitsTitle',
      bodyKey: 'help.premid.limitsBody',
      titleIcon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    },
  ];

  return (
    <TutoLayout
      icon={<Gamepad2 className="w-10 h-10 text-indigo-400" />}
      title={t('help.premid.title')}
      heroSub={t('help.premid.heroSub')}
      sections={sections}
    />
  );
};

export default PremidPage;

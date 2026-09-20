import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react';
import TutoLayout, { TutoSection } from '../../components/TutoLayout';

const QualiteVideoPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t('help.qualiteVideo.title')} — Orvix`;
  }, [t]);

  const sections: TutoSection[] = [
    {
      kind: 'text',
      bodyKey: 'help.qualiteVideo.introBody',
    },
    {
      kind: 'text',
      titleKey: 'help.qualiteVideo.hlsTitle',
      bodyKey: 'help.qualiteVideo.hlsBody1',
    },
    {
      kind: 'text',
      bodyKey: 'help.qualiteVideo.hlsBody2',
    },
    {
      kind: 'text',
      bodyKey: 'help.qualiteVideo.hlsBody3',
    },
    {
      kind: 'table',
      titleKey: 'help.qualiteVideo.embedTitle',
      introKey: 'help.qualiteVideo.embedIntro',
      headerKeys: [
        'help.qualiteVideo.tableProvider',
        'help.qualiteVideo.tableMaxQuality',
      ],
      rowKeys: [
        [
          'help.qualiteVideo.providerUqload',
          'help.qualiteVideo.providerUqloadQuality',
        ],
        [
          'help.qualiteVideo.providerSibnet',
          'help.qualiteVideo.providerSibnetQuality',
        ],
        ['help.qualiteVideo.providerVoe', 'help.qualiteVideo.providerVoeQuality'],
        [
          'help.qualiteVideo.providerSupervideo',
          'help.qualiteVideo.providerSupervideoQuality',
        ],
        [
          'help.qualiteVideo.providerVidzy',
          'help.qualiteVideo.providerVidzyQuality',
        ],
        [
          'help.qualiteVideo.providerDoodstream',
          'help.qualiteVideo.providerDoodstreamQuality',
        ],
        [
          'help.qualiteVideo.providerSeekstream',
          'help.qualiteVideo.providerSeekstreamQuality',
        ],
        [
          'help.qualiteVideo.providerVidplay',
          'help.qualiteVideo.providerVidplayQuality',
        ],
      ],
      noteKey: 'help.qualiteVideo.embedNote',
    },
    {
      kind: 'text',
      titleKey: 'help.qualiteVideo.checkYourselfTitle',
      bodyKey: 'help.qualiteVideo.checkYourselfBody',
    },
    {
      kind: 'text',
      titleKey: 'help.qualiteVideo.tipTitle',
      bodyKey: 'help.qualiteVideo.tipBody',
    },
  ];

  return (
    <TutoLayout
      icon={<Gauge className="w-10 h-10 text-green-400" />}
      title={t('help.qualiteVideo.title')}
      heroSub={t('help.qualiteVideo.heroSub')}
      sections={sections}
    />
  );
};

export default QualiteVideoPage;

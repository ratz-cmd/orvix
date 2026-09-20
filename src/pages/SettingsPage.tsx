import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PrefetchLink as Link } from '@/routing/PrefetchLink';
import { motion } from 'framer-motion';
import {
  Settings,
  Captions,
  Globe,
  Crown,
  ListOrdered,
  Megaphone,
  ArrowLeft,
  Key,
  CalendarClock,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import { AVAILABLE_LANGUAGES, changeLanguage, type SupportedLanguage } from '../i18n';
import { SourcePriorityPanel } from '../components/Settings/SourcePriorityPanel';
import {
  getRememberLastPlayer,
  setRememberLastPlayer,
  subscribeToLastPlayerChanges,
} from '../utils/lastPlayerPref';
import {
  getAdPopupMode,
  setAdPopupMode,
  subscribeToAdPopupModeChanges,
  type AdPopupMode,
} from '../utils/adPopupMode';
import {
  isAdultAdsEnabled,
  setAdultAdsEnabled,
  subscribeToAdultAdsChanges,
} from '../utils/adAdultMode';
import { SubtitlePreview } from '../components/subtitles/SubtitlePreview';
import { SubtitleStyleControls } from '../components/subtitles/SubtitleStyleControls';
import { useSubtitlePreferences } from '../hooks/useSubtitlePreferences';

const API_URL = import.meta.env.VITE_MAIN_API;

interface VipStatus {
  isVip: boolean;
  expiresAt?: string;
  features: string[];
}

// ─── Section IDs for navigation ──────────────────────────────────────────────

const SECTIONS = [
  { id: 'subtitles', labelKey: 'settings.sections.subtitles', icon: Captions },
  { id: 'language', labelKey: 'settings.sections.language', icon: Globe },
  { id: 'vip', labelKey: 'settings.sections.vip', icon: Crown },
  { id: 'source-priority', labelKey: 'settings.sections.sourcePriority', icon: ListOrdered },
  { id: 'intermission', labelKey: 'settings.sections.adPopup', icon: Megaphone },
] as const;

export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);

  const [activeSection, setActiveSection] = useState<string>('subtitles');

  // VIP State
  const [vipStatus, setVipStatus] = useState<VipStatus>(() => ({
    isVip: localStorage.getItem('is_vip') === 'true',
    expiresAt: localStorage.getItem('vip_expires_at') || undefined,
    features: ['ad_free', 'hd_streaming', 'priority_support'],
  }));
  const [premiumKey, setPremiumKey] = useState('');
  const [vipKeyError, setVipKeyError] = useState<string | null>(null);
  const [isActivatingKey, setIsActivatingKey] = useState(false);
  const [isVipKeyHovered, setIsVipKeyHovered] = useState(false);

  // Player & Ads State
  const [rememberLastPlayer, setRememberLastPlayerState] = useState<boolean>(() => getRememberLastPlayer());
  const [adPopupMode, setAdPopupModeState] = useState<AdPopupMode>(() => getAdPopupMode());
  const [adultAds, setAdultAdsState] = useState<boolean>(() => isAdultAdsEnabled());

  // Subtitles
  const {
    preferences: subtitlePreferences,
    patchPreferences,
    previewPreferences,
    commitPreferences,
    resetAppearance,
  } = useSubtitlePreferences();

  // ─── Sync Subscriptions ───────────────────────────────────────────────────

  useEffect(() => subscribeToLastPlayerChanges(setRememberLastPlayerState), []);
  useEffect(() => subscribeToAdPopupModeChanges(setAdPopupModeState), []);
  useEffect(() => subscribeToAdultAdsChanges(setAdultAdsState), []);

  useEffect(() => {
    const handleVipChange = () => {
      setVipStatus({
        isVip: localStorage.getItem('is_vip') === 'true',
        expiresAt: localStorage.getItem('vip_expires_at') || undefined,
        features: ['ad_free', 'hd_streaming', 'priority_support'],
      });
    };
    window.addEventListener('storage', handleVipChange);
    window.addEventListener('auth_changed', handleVipChange);
    return () => {
      window.removeEventListener('storage', handleVipChange);
      window.removeEventListener('auth_changed', handleVipChange);
    };
  }, []);

  // ─── Scroll Spy ───────────────────────────────────────────────────────────

  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
      const scrollPosition = window.scrollY + 140;

      for (let i = sectionElements.length - 1; i >= 0; i--) {
        const el = sectionElements[i];
        if (el.offsetTop <= scrollPosition) {
          setActiveSection(SECTIONS[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 90;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
      setActiveSection(id);
    }
  };

  // ─── VIP Handlers ─────────────────────────────────────────────────────────

  const handleActivatePremiumKey = async () => {
    if (!premiumKey.trim()) return;
    setIsActivatingKey(true);
    setVipKeyError(null);

    try {
      const res = await fetch(`${API_URL}/api/access-codes/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: premiumKey.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('is_vip', 'true');
        localStorage.setItem('access_code', premiumKey.trim());
        if (data.expiresAt) {
          localStorage.setItem('vip_expires_at', data.expiresAt);
        }
        setVipStatus({
          isVip: true,
          expiresAt: data.expiresAt,
          features: ['ad_free', 'hd_streaming', 'priority_support'],
        });
        setPremiumKey('');
        window.dispatchEvent(new CustomEvent('auth_changed'));
      } else {
        setVipKeyError(data.message || t('settings.invalidVipKey'));
      }
    } catch {
      setVipKeyError(t('settings.vipActivationError'));
    } finally {
      setIsActivatingKey(false);
    }
  };

  const handleRemovePremiumKey = () => {
    localStorage.removeItem('is_vip');
    localStorage.removeItem('access_code');
    localStorage.removeItem('vip_expires_at');
    setVipStatus({
      isVip: false,
      expiresAt: undefined,
      features: [],
    });
    window.dispatchEvent(new CustomEvent('auth_changed'));
  };

  const copyPremiumKey = () => {
    const code = localStorage.getItem('access_code');
    if (code) {
      navigator.clipboard.writeText(code);
    }
  };

  // ─── Toggle Handlers ──────────────────────────────────────────────────────

  const handleRememberLastPlayerToggle = () => {
    const next = !rememberLastPlayer;
    setRememberLastPlayer(next);
    setRememberLastPlayerState(next);
  };

  const handleAdPopupModeChange = (mode: AdPopupMode) => {
    setAdPopupMode(mode);
    setAdPopupModeState(mode);
  };

  const handleAdultAdsToggle = () => {
    const next = !adultAds;
    setAdultAdsEnabled(next);
    setAdultAdsState(next);
  };

  const renderToggle = (value: boolean, onToggle: () => void, color: string = 'red') => {
    const bgActive =
      color === 'indigo'
        ? 'bg-indigo-500'
        : color === 'yellow'
        ? 'bg-yellow-500'
        : color === 'green'
        ? 'bg-green-500'
        : 'bg-blue-600';
    return (
      <button
        onClick={onToggle}
        className={`relative ml-4 w-14 h-8 rounded-full transition-colors duration-300 flex-shrink-0 ${
          value ? bgActive : 'bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${
            value ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </button>
    );
  };

  return (
    <div className="min-h-screen overflow-clip bg-black text-white">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center gap-4 border-b border-gray-800/60 bg-black p-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-800/60 transition-colors text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600/20 to-orange-600/20 border border-blue-500/20">
            <Settings className="w-5 h-5 text-blue-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">{t('settings.title')}</h1>
        </div>
      </div>

      {/* Main layout */}
      <div className="w-full pb-8">
        <div className="lg:grid lg:grid-cols-[280px,minmax(0,1fr)] lg:gap-0">
          {/* ─── Fixed Sidebar ──────────────────────────────────────── */}
          <aside className="hidden min-w-0 border-r border-white/[0.06] bg-black lg:block">
            <nav className="sticky top-20 flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-black px-5 py-7">
              <div className="mb-4 flex flex-none items-center gap-3 border-b border-gray-800/40 pb-5">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 rounded-lg hover:bg-gray-800/60 transition-colors text-gray-400 hover:text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600/20 to-orange-600/20 border border-blue-500/20">
                  <Settings className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-white">{t('settings.title')}</h1>
                  <p className="text-xs text-gray-500">{t('settings.subtitle')}</p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
                <ul className="space-y-1">
                  {SECTIONS.map(({ id, labelKey, icon: Icon }) => {
                    const isActive = activeSection === id;
                    return (
                      <li key={id}>
                        <button
                          onClick={() => scrollToSection(id)}
                          className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 border focus:outline-none ${
                            isActive
                              ? 'text-blue-400 border-transparent'
                              : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                          }`}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="settings-sidebar-indicator"
                              className="absolute inset-0 bg-blue-600/15 border border-blue-500/20 rounded-xl shadow-sm shadow-red-600/5 pointer-events-none"
                              transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                            />
                          )}
                          <Icon className={`relative z-10 w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} />
                          <span className="relative z-10">{t(labelKey)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-4 flex-none border-t border-gray-800/40 pt-4">
                <Link
                  to="/profile"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('nav.backToProfile')}
                </Link>
              </div>
            </nav>
          </aside>

          {/* ─── Main Content ───────────────────────────────────────── */}
          <main className="min-w-0 px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8 xl:px-10">
            {/* Mobile Section Tabs */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0f]/95 border-t border-gray-800/60 px-2 pb-[env(safe-area-inset-bottom)]">
              <div className="overflow-x-auto scrollbar-hide touch-pan-x scroll-smooth">
                <div className="mx-auto flex w-max min-w-full justify-center gap-1 px-2 py-2">
                  {SECTIONS.map(({ id, labelKey, icon: Icon }) => {
                    const isActive = activeSection === id;
                    return (
                      <button
                        key={id}
                        onClick={() => scrollToSection(id)}
                        className={`flex w-[72px] flex-shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-center transition-colors ${
                          isActive ? 'text-blue-400' : 'text-gray-500'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[10px] font-medium whitespace-nowrap">{t(labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div ref={contentRef} className="mx-auto mt-4 min-w-0 max-w-[1200px] space-y-12 pb-24 lg:pb-8">
              {/* ════════════════════════════════════════════════════════ */}
              {/* SECTION: Sous-titres                                    */}
              {/* ════════════════════════════════════════════════════════ */}
              <section id="subtitles" className="scroll-mt-36">
                <div className="mb-6 flex items-center gap-3">
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-600/15 p-2">
                    <Captions className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{t('settings.subtitles.title')}</h2>
                    <p className="text-sm text-gray-500">{t('settings.subtitles.description')}</p>
                  </div>
                </div>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] xl:items-start">
                  <div className="min-w-0 xl:col-start-2 xl:row-start-1 xl:sticky xl:top-36">
                    <div className="space-y-4 rounded-2xl border border-white/10 bg-gray-900/35 p-5">
                      <h3 className="font-semibold text-white">{t('settings.subtitles.preview')}</h3>
                      <SubtitlePreview preferences={subtitlePreferences} onChange={patchPreferences} />
                    </div>
                  </div>
                  <div className="min-w-0 xl:col-start-1 xl:row-start-1">
                    <SubtitleStyleControls
                      preferences={subtitlePreferences}
                      onChange={patchPreferences}
                      onPreviewChange={previewPreferences}
                      onCommitPreview={commitPreferences}
                      onReset={resetAppearance}
                      density="full"
                      showPreview={false}
                    />
                  </div>
                </div>
              </section>

              {/* ════════════════════════════════════════════════════════ */}
              {/* SECTION: Langue                                         */}
              {/* ════════════════════════════════════════════════════════ */}
              <section id="language" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-sky-600/20 to-blue-600/20 border border-sky-500/20">
                    <Globe className="w-5 h-5 text-sky-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{t('settings.language')}</h2>
                    <p className="text-sm text-gray-500">{t('settings.languageDesc')}</p>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {AVAILABLE_LANGUAGES.map((lang) => {
                      const isActive = i18n.language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          onClick={() => changeLanguage(lang.code as SupportedLanguage)}
                          className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                            isActive
                              ? 'bg-sky-600/15 border-sky-500/30 text-white shadow-sm shadow-sky-600/5'
                              : 'bg-gray-800/30 border-gray-700/40 text-gray-400 hover:bg-gray-800/50 hover:border-gray-600/50 hover:text-white'
                          }`}
                        >
                          <span className="text-2xl">
                            <img src={lang.flagUrl} alt={lang.label} className="w-8 h-6 rounded-sm object-cover" />
                          </span>
                          <div className="text-left">
                            <div className={`text-sm font-medium ${isActive ? 'text-sky-300' : 'text-white'}`}>
                              {lang.label}
                            </div>
                            <div className="text-xs text-gray-500">{lang.code.toUpperCase()}</div>
                          </div>
                          {isActive && <div className="ml-auto w-2 h-2 rounded-full bg-sky-400" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </section>

              {/* ════════════════════════════════════════════════════════ */}
              {/* SECTION: VIP                                            */}
              {/* ════════════════════════════════════════════════════════ */}
              <section id="vip" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-yellow-600/20 to-amber-600/20 border border-yellow-500/20">
                    <Crown className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{t('vip.title')}</h2>
                    <p className="text-sm text-gray-500">{t('settings.vipDesc')}</p>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gray-800/30 rounded-xl border border-gray-700/40 p-6"
                >
                  {!vipStatus.isVip ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-4 bg-yellow-500/5 rounded-xl border border-yellow-500/10">
                        <Key className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="text-sm font-medium text-yellow-300">{t('settings.activateVipKey')}</h4>
                          <p className="text-xs text-gray-400 mt-1">{t('settings.activateVipKeyDesc')}</p>
                        </div>
                      </div>
                      <div className="flex flex-col md:flex-row gap-3">
                        <input
                          className="flex h-11 w-full rounded-lg pr-3 pl-4 py-2 text-sm bg-gray-900/60 border border-gray-700/50 focus:border-yellow-500/50 focus:bg-gray-900/80 text-white placeholder:text-gray-600 outline-none transition-colors"
                          placeholder={t('settings.enterVipKey')}
                          value={premiumKey}
                          onChange={(e) => setPremiumKey(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleActivatePremiumKey()}
                        />
                        <button
                          className={`flex items-center justify-center font-medium h-11 text-sm px-6 rounded-lg bg-yellow-500 text-black hover:bg-yellow-400 transition-colors whitespace-nowrap flex-shrink-0 ${
                            !premiumKey.trim() || isActivatingKey ? 'opacity-30 pointer-events-none' : ''
                          }`}
                          onClick={handleActivatePremiumKey}
                          disabled={!premiumKey.trim() || isActivatingKey}
                        >
                          {isActivatingKey ? t('settings.activating') : t('settings.activate')}
                        </button>
                      </div>
                      {vipKeyError && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-blue-400 text-xs bg-blue-500/10 p-3 rounded-lg border border-blue-500/20"
                        >
                          {vipKeyError}
                        </motion.p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                        <Crown className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                        <div>
                          <h4 className="text-sm font-semibold text-yellow-300">{t('settings.youAreVip')}</h4>
                          <p className="text-xs text-gray-400 mt-0.5">{t('settings.vipDescription')}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-4 bg-gray-800/30 rounded-xl border border-gray-700/40">
                        <CalendarClock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        <div>
                          <span className="text-xs text-gray-500">{t('settings.vipExpiresOn')}</span>
                          <p className="text-sm text-white font-medium">
                            {vipStatus.expiresAt
                              ? (() => {
                                  const d = new Date(
                                    isNaN(Number(vipStatus.expiresAt))
                                      ? vipStatus.expiresAt
                                      : Number(vipStatus.expiresAt)
                                  );
                                  return isNaN(d.getTime())
                                    ? t('settings.vipNoExpiration')
                                    : d.toLocaleDateString(i18n.language, {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                      });
                                })()
                              : t('settings.vipNoExpiration')}
                          </p>
                        </div>
                      </div>

                      <div
                        className="flex flex-col gap-2 border border-gray-700/40 rounded-xl px-4 pt-4 pb-3 cursor-pointer hover:border-gray-600/50 transition-colors"
                        onMouseEnter={() => setIsVipKeyHovered(true)}
                        onMouseLeave={() => setIsVipKeyHovered(false)}
                      >
                        <span className="text-xs text-gray-500">{t('settings.yourVipKey')}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-white text-sm font-mono transition-opacity duration-200"
                            style={{
                              opacity: isVipKeyHovered ? 0 : 1,
                              display: isVipKeyHovered ? 'none' : 'block',
                            }}
                          >
                            {localStorage.getItem('access_code')?.replace(/./g, '•') || '••••••••••••'}
                          </span>
                          <span
                            className="text-white text-sm font-mono transition-opacity duration-200"
                            style={{
                              opacity: isVipKeyHovered ? 1 : 0,
                              display: isVipKeyHovered ? 'block' : 'none',
                            }}
                          >
                            {localStorage.getItem('access_code') || ''}
                          </span>
                          <button
                            onClick={copyPremiumKey}
                            className="ml-auto p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-500 hover:text-white transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <button
                        className="text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 px-4 py-2 rounded-lg transition-colors"
                        onClick={handleRemovePremiumKey}
                      >
                        {t('settings.removeVipKey')}
                      </button>
                    </div>
                  )}
                </motion.div>
              </section>

              {/* ════════════════════════════════════════════════════════ */}
              {/* SECTION: Priorité des sources                           */}
              {/* ════════════════════════════════════════════════════════ */}
              <section id="source-priority" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-600/20 to-violet-600/20 border border-indigo-500/20">
                    <ListOrdered className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{t('settings.sourcePriority.title')}</h2>
                    <p className="text-sm text-gray-500">{t('settings.sourcePriority.description')}</p>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 mb-4 bg-gray-800/30 rounded-xl border border-gray-700/40 hover:border-gray-600/50 transition-colors group"
                >
                  <div className="flex-1 mr-4">
                    <h4 className="font-medium text-white mb-0.5 text-sm">
                      {t('settings.sourcePriority.rememberLastPlayerTitle')}
                    </h4>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {t('settings.sourcePriority.rememberLastPlayerDesc')}
                    </p>
                  </div>
                  {renderToggle(rememberLastPlayer, handleRememberLastPlayerToggle, 'indigo')}
                </motion.div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <SourcePriorityPanel />
                </div>
              </section>

              {/* ════════════════════════════════════════════════════════ */}
              {/* SECTION: Popup pub                                      */}
              {/* ════════════════════════════════════════════════════════ */}
              <section id="intermission" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-amber-600/20 to-orange-600/20 border border-amber-500/20">
                    <Megaphone className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{t('settings.adPopup.title')}</h2>
                    <p className="text-sm text-gray-500">{t('settings.adPopup.description')}</p>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/40"
                >
                  <div className="mb-3">
                    <h4 className="font-medium text-white mb-0.5 text-sm">{t('settings.adPopup.modeTitle')}</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">{t('settings.adPopup.modeDesc')}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(
                      [
                        {
                          id: 'normal',
                          labelKey: 'settings.adPopup.modes.normal.label',
                          descKey: 'settings.adPopup.modes.normal.desc',
                        },
                        {
                          id: 'auto',
                          labelKey: 'settings.adPopup.modes.auto.label',
                          descKey: 'settings.adPopup.modes.auto.desc',
                        },
                        {
                          id: 'click-anywhere',
                          labelKey: 'settings.adPopup.modes.clickAnywhere.label',
                          descKey: 'settings.adPopup.modes.clickAnywhere.desc',
                        },
                      ] as const
                    ).map((opt) => {
                      const active = adPopupMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleAdPopupModeChange(opt.id)}
                          className={`flex-1 min-w-[140px] p-3 rounded-xl text-left transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                            active
                              ? 'bg-amber-600/10 border-amber-500/40 text-white'
                              : 'bg-gray-700/20 border-gray-700/40 text-gray-400 hover:bg-gray-700/40 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-semibold">{t(opt.labelKey)}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">{t(opt.descKey)}</div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="flex items-center justify-between p-4 mt-4 bg-gray-800/30 rounded-xl border border-gray-700/40 hover:border-gray-600/50 transition-colors group"
                >
                  <div className="flex-1 mr-4">
                    <div className="flex items-center gap-2 mb-0.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-blue-400" />
                      <h4 className="font-medium text-white text-sm">{t('settings.adPopup.adultTitle')}</h4>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{t('settings.adPopup.adultDesc')}</p>
                  </div>
                  {renderToggle(adultAds, handleAdultAdsToggle, 'red')}
                </motion.div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

import React from "react";
import { Zap, Palette, Code2, Flame, Waves, Scale, Shield, Smartphone, Github, Euro } from "lucide-react";
import { PrefetchLink as Link } from '@/routing/PrefetchLink';
import "./Footer.css";
import { useTranslation } from 'react-i18next';

const Footer: React.FC = () => {
  const { t } = useTranslation();
  return (
  <>
    {/* Barre de délimitation */}
    <div className="relative z-10 w-full h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>

    <footer className="relative z-10 bg-black text-gray-300 py-8 mt-0">
      <div className="container mx-auto px-6 max-w-6xl">
        {/* Section principale */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">

          {/* Disclaimer légal */}
          <div className="lg:col-span-2">
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.legalDisclaimer')}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {t('footer.disclaimerText')}
            </p>
            
          </div>

          {/* Boutons d'action */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.information')}</h3>
            <div className="space-y-6">
              <a
                href="https://orvix.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-row items-center gap-3 text-gray-50 font-medium opacity-75 transition-all hover:opacity-100"
              >
                <span className="size-5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="1.25em" height="1.25em" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3a9 9 0 1 0 9 9A9.01 9.01 0 0 0 12 3Zm0 2a7 7 0 0 1 6.32 4H14a1 1 0 0 0 0 2h4.95a7.06 7.06 0 0 1 0 2H14a1 1 0 0 0 0 2h4.32A7 7 0 1 1 12 5Z" />
                  </svg>
                </span>
                {t('footer.ourUrls')}
              </a>
              <a
                href="https://discord.gg/vjt4PRAMBR"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-row items-center gap-3 text-gray-50 font-medium opacity-75 transition-all hover:opacity-100"
              >
                <span className="size-5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="1.25em" height="1.25em" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
                  </svg>
                </span>
                Discord
              </a>

              

              <Link
                className="flex flex-row items-center gap-3 text-gray-50 font-medium opacity-75 transition-all mt-4 hover:opacity-100"
                to="/privacy"
              >
                <Shield className="size-5" />
                {t('nav.privacy')}
              </Link>

              <Link
                className="flex flex-row items-center gap-3 text-gray-50 font-medium opacity-75 transition-all mt-4 hover:opacity-100"
                to="/terms-of-service"
              >
                <Scale className="size-5" />
                {t('auth.termsOfService')}
              </Link>

              

              <Link
                className="flex flex-row items-center gap-3 text-gray-50 font-medium opacity-75 transition-all mt-4 hover:opacity-100"
                to="/dmca"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-gavel size-5 fill-white">
                  <path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8"></path>
                  <path d="m16 16 6-6"></path>
                  <path d="m8 8 6-6"></path>
                  <path d="m9 7 8 8"></path>
                  <path d="m21 11-8-8"></path>
                </svg>
                DMCA
              </Link>

              <Link
                className="flex flex-row items-center gap-3 text-gray-50 font-medium opacity-75 transition-all mt-4 hover:opacity-100"
                to="/frais"
              >
                <Euro className="size-5" />
                {t('costs.navLabel')}
              </Link>
            </div>
          </div>

          {/* Technologies utilisées */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.builtWith')}</h3>
            <div className="space-y-2 text-sm">
              <a
                href="https://react.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="2" />
                  <path d="M12 1a11 11 0 0 0 0 22 11 11 0 0 0 0-22zm0 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
                  <ellipse cx="12" cy="12" rx="11" ry="4" fill="none" stroke="currentColor" strokeWidth="1" />
                  <ellipse cx="12" cy="12" rx="11" ry="4" fill="none" stroke="currentColor" strokeWidth="1" transform="rotate(60 12 12)" />
                  <ellipse cx="12" cy="12" rx="11" ry="4" fill="none" stroke="currentColor" strokeWidth="1" transform="rotate(120 12 12)" />
                </svg>
                <span>React 18</span>
              </a>
              <a
                href="https://www.typescriptlang.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <Code2 className="w-5 h-5 text-blue-500" />
                <span>TypeScript</span>
              </a>
              <a
                href="https://tailwindcss.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <Palette className="w-5 h-5 text-cyan-400" />
                <span>Tailwind CSS</span>
              </a>
              <a
                href="https://vitejs.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <Zap className="w-5 h-5 text-yellow-400" />
                <span>Vite</span>
              </a>
              <a
                href="https://www.framer.com/motion/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <Waves className="w-5 h-5 text-purple-400" />
                <span>Framer Motion</span>
              </a>
              <a
                href="https://www.mysql.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <Flame className="w-5 h-5 text-orange-400" />
                <span>MySQL</span>
              </a>
              <a
                href="https://expressjs.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <Zap className="w-5 h-5 text-green-400" />
                <span>Express</span>
              </a>
              <a
                href="https://www.python.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <svg className="w-5 h-5 text-yellow-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.914 0C5.82 0 6.2 2.656 6.2 2.656l.007 2.752h5.814v.826H3.9S0 5.789 0 11.969c0 6.18 3.403 5.96 3.403 5.96h2.03v-2.867s-.109-3.42 3.35-3.42h5.766s3.24.052 3.24-3.148V3.202S18.28 0 11.914 0zM8.708 1.85a1.06 1.06 0 1 1 0 2.12 1.06 1.06 0 0 1 0-2.12z" />
                  <path d="M12.086 24c6.094 0 5.714-2.656 5.714-2.656l-.007-2.752h-5.814v-.826h8.123S24 18.211 24 12.031c0-6.18-3.403-5.96-3.403-5.96h-2.03v2.867s.109 3.42-3.35 3.42H9.451s-3.24-.052-3.24 3.148v5.292S5.72 24 12.086 24zm3.206-1.85a1.06 1.06 0 1 1 0-2.12 1.06 1.06 0 0 1 0 2.12z" />
                </svg>
                <span>Python</span>
              </a>
              <a
                href="https://www.rust-lang.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <Code2 className="w-5 h-5 text-orange-300" />
                <span>Rust</span>
              </a>
              <a
                href="https://redis.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity duration-200"
              >
                <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.5 2.661l.54.997-1.797.644 2.409.166.54.997-1.797.644 2.409.166.002.009L24 10.064 12 14.994 0 10.064l5.572-2.287 2.409.166.54.997-1.797.644 2.409.166.54.997zm1.5 13.833L24 12.164v3.5L12 19.994 0 15.664v-3.5l12 4.33zm0 5.5L24 17.664v3.5L12 25.494 0 21.164v-3.5l12 4.33z" />
                </svg>
                <span>Redis</span>
              </a>
            </div>
          </div>
        </div>

        {/* Ligne de séparation */}
        <div className="border-t border-gray-800 pt-6">
          <div className="text-center text-sm text-gray-500 pb-4">
            <p>© {new Date().getFullYear()} Orvix. {t('footer.allRightsReserved')}</p>
          </div>
        </div>
      </div>
    </footer>
  </>
  );
};

export default Footer;

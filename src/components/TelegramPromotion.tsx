import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const TelegramPromotion: React.FC = () => {
  const { t } = useTranslation();
  // Gate le halo animé par la visibilité — sans ça `animate` avec `repeat:
  // Infinity` tourne en continu (tick rAF permanent) même quand la section
  // est hors écran. `once: false` (défaut) : l'animation se coupe/reprend à
  // chaque sortie/entrée du viewport.
  const haloRef = useRef<HTMLDivElement>(null);
  const isHaloInView = useInView(haloRef, { amount: 0.1 });
  return (
    <motion.div
      className="px-4 md:px-8"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{
        duration: 0.7,
        ease: "easeOut",
        delay: 0.2
      }}
    >
      <motion.div
        className="relative overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-blue-600 to-sky-800"
        initial={{ scale: 0.95, opacity: 0.8 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="flex flex-col md:flex-row items-center justify-between p-6 md:p-8">
          <motion.div
            className="mb-6 md:mb-0 md:mr-8 text-white"
            initial={{ x: -50, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <motion.h2
              className="text-2xl md:text-3xl font-bold mb-2"
              initial={{ y: -20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              {t('telegram.joinCommunity')}
            </motion.h2>
            <motion.p
              className="text-sky-200 text-sm md:text-base mb-4"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <span dangerouslySetInnerHTML={{ __html: t('telegram.officialAnnouncements') }} />
              <br />
              👉 <strong>{t('telegram.joinUsNow')}</strong>
            </motion.p>
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Bouton Telegram seulement */}

              {/* Bouton Telegram */}
              <motion.a
                href="https://discord.gg/vjt4PRAMBR"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-sky-500 text-white font-medium px-6 py-3 rounded-lg transition-all"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.5,
                  delay: 0.8,
                  type: 'spring',
                  stiffness: 400,
                  damping: 10
                }}
                whileHover={{
                  backgroundColor: 'rgba(14, 165, 233, 1)',
                  scale: 1.05,
                  boxShadow: '0 0 15px rgba(14, 165, 233, 0.6)'
                }}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  initial={{ rotate: 0 }}
                  whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="w-5 h-5" viewBox="0 0 16 16">
                    <path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
                  </svg>
                </motion.div>
                <motion.span
                  initial={{ opacity: 0.9 }}
                  whileHover={{ opacity: 1 }}
                  className="relative"
                >
                  {t('telegram.joinTelegram')}
                </motion.span>
              </motion.a>



            </div>
          </motion.div>
          <motion.div
            className="relative w-40 h-40 md:w-48 md:h-48 flex-shrink-0"
            initial={{ x: 50, opacity: 0, rotate: 10 }}
            whileInView={{ x: 0, opacity: 1, rotate: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{
              type: "spring",
              stiffness: 100,
              damping: 20,
              delay: 0.5
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="absolute w-full h-full object-contain z-10 drop-shadow-lg" viewBox="0 0 16 16">
              <path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
            </svg>
            <motion.div
              ref={haloRef}
              className="absolute -inset-4 bg-sky-500 rounded-full blur-2xl opacity-30"
              animate={isHaloInView ? {
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3]
              } : {
                scale: 1,
                opacity: 0.3
              }}
              transition={isHaloInView ? {
                duration: 3,
                repeat: Infinity,
                repeatType: "reverse"
              } : {
                duration: 0.3
              }}
            ></motion.div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TelegramPromotion;
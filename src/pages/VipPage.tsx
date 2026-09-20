import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Zap,
  MessageCircle,
  Shield,
  ArrowLeft,
  Heart,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  LogOut,
} from "lucide-react";
import { PrefetchLink as Link } from '@/routing/PrefetchLink';
import { useTranslation } from "react-i18next";
import { SquareBackground } from "../components/ui/square-background";
import BlurText from "../components/ui/blur-text";
import ShinyText from "../components/ui/shiny-text";
import AnimatedBorderCard from "../components/ui/animated-border-card";
import {
  activateVipKey,
  checkVipStatus,
  getVipDetails,
  revokeVipStatus,
} from "../utils/vipUtils";

const DISCORD_URL = import.meta.env.VITE_DISCORD_URL || "https://discord.gg/vjt4PRAMBR";

const VipPage: React.FC = () => {
  const { t } = useTranslation();
  const [keyCode, setKeyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [vipState, setVipState] = useState(() => getVipDetails());

  useEffect(() => {
    checkVipStatus(true)
      .then(() => setVipState(getVipDetails()))
      .catch(() => {});

    const sync = () => setVipState(getVipDetails());
    window.addEventListener("storage", sync);
    window.addEventListener("vipStatusChanged", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("vipStatusChanged", sync);
    };
  }, []);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyCode.trim()) {
      setErrorMsg("Veuillez entrer une clé de licence VIP");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const result = await activateVipKey(keyCode);
    setLoading(false);

    if (result.success) {
      setSuccessMsg(result.message);
      setKeyCode("");
      setVipState(getVipDetails());
    } else {
      setErrorMsg(result.message);
    }
  };

  const handleRevoke = () => {
    if (window.confirm("Voulez-vous déconnecter votre clé VIP de cet appareil ?")) {
      revokeVipStatus();
      setVipState(getVipDetails());
      setSuccessMsg(null);
    }
  };

  const features = [
    {
      icon: Zap,
      text: t("vip.adFreePlayers"),
      desc: t("vip.adFreePlayersDesc"),
    },
    {
      icon: Shield,
      text: t("vip.noAdBeforeContent"),
      desc: t("vip.noAdBeforeContentDesc"),
    },
    {
      icon: Crown,
      text: t("vip.priorityRequests"),
      desc: t("vip.priorityRequestsDesc"),
    },
  ];

  return (
    <SquareBackground
      squareSize={48}
      borderColor="rgba(59, 130, 246, 0.15)"
      className="min-h-screen bg-black text-white"
    >
      <div className="container mx-auto px-6 py-12 relative z-10 h-full overflow-y-auto">
        {/* Back Button */}
        <Link
          to="/"
          className="inline-flex items-center text-white/50 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          {t("common.backToHome")}
        </Link>

        <div className="max-w-4xl mx-auto text-center space-y-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center justify-center p-3 bg-yellow-500/10 rounded-full mb-4 ring-1 ring-yellow-500/50 shadow-lg shadow-yellow-500/10">
              <Crown className="w-8 h-8 text-yellow-500" />
            </div>
            <BlurText
              text={t("vip.becomeVip") + " Orvix"}
              delay={300}
              animateBy="words"
              direction="top"
              className="text-4xl md:text-6xl font-bold text-white justify-center"
            />
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              {t("vip.supportPlatform")}{" "}
              <ShinyText
                text="10€ / an"
                speed={2}
                color="#fbbf24"
                shineColor="#ffffff"
                className="font-bold text-2xl"
              />
              .
            </p>
            <div className="mt-2 max-w-xl mx-auto">
              <BlurText
                text="Profitez d'Orvix sans aucune publicité, sans attente et avec une qualité de visionnage maximale."
                delay={100}
                className="text-sm md:text-base text-white/50 italic justify-center"
              />
            </div>
          </motion.div>

          {/* SECTION D'ACTIVATION DE CLÉ VIP */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="max-w-2xl mx-auto"
          >
            <AnimatedBorderCard
              highlightColor={vipState.isVip ? "16 185 129" : "234 179 8"}
              backgroundColor="10 14 23"
              className="p-6 md:p-8 backdrop-blur-md rounded-2xl border border-white/10 text-left shadow-2xl"
            >
              {vipState.isVip ? (
                /* État : VIP Déjà Actif */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <Crown className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <span>Statut VIP Actif</span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                            Orvix Pro
                          </span>
                        </h3>
                        <p className="text-xs text-emerald-400/80">
                          Votre accès 100% sans publicité est débloqué
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleRevoke}
                      title="Déconnecter le VIP"
                      className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="hidden sm:inline">Déconnecter</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                      <span className="text-xs text-white/50 block mb-1">Clé de licence</span>
                      <span className="font-mono text-sm font-semibold text-yellow-400">
                        {vipState.key || "ORVIX-VIP-ACTIF"}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                      <span className="text-xs text-white/50 block mb-1">Validité</span>
                      <span className="text-sm font-semibold text-white">
                        {vipState.remainingDays !== null
                          ? `${vipState.remainingDays} jours restants`
                          : "Actif à vie"}
                      </span>
                    </div>
                  </div>

                  {vipState.expiresAt && (
                    <p className="text-xs text-white/40 text-center pt-1">
                      Expire le {new Date(vipState.expiresAt).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                </div>
              ) : (
                /* État : Formulaire d'activation de clé */
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 rounded-xl bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                      <KeyRound className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Activer ma Clé VIP</h3>
                      <p className="text-xs text-white/60">
                        Entrez la clé reçue lors de votre achat annuel (10€)
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleActivate} className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        placeholder="ORVIX-VIP-XXXX-XXXX-XXXX"
                        value={keyCode}
                        onChange={(e) => setKeyCode(e.target.value.toUpperCase())}
                        disabled={loading}
                        className="flex-1 px-4 py-3 bg-black/60 border border-white/20 rounded-xl text-white font-mono text-sm uppercase tracking-wider placeholder:text-white/30 focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 transition-all"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:to-amber-500 text-black font-bold text-sm shadow-lg shadow-yellow-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Vérification...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Activer</span>
                          </>
                        )}
                      </button>
                    </div>

                    {errorMsg && (
                      <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    {successMsg && (
                      <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>{successMsg}</span>
                      </div>
                    )}
                  </form>

                    {/* Encart Achat Discord */}
                    <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-left">
                        <p className="text-sm font-semibold text-white">
                          Vous n'avez pas encore de clé VIP ?
                        </p>
                        <p className="text-xs text-white/60">
                          Pour acheter votre accès 1 an (10€), rejoignez notre Discord officiel !
                        </p>
                      </div>
                      <a
                        href={DISCORD_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 whitespace-nowrap hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Acheter sur Discord (10€)</span>
                      </a>
                    </div>
                  </div>
                )}
            </AnimatedBorderCard>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="grid md:grid-cols-3 gap-6 text-left"
          >
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                whileHover={{ scale: 1.02 }}
                className="h-full group"
              >
                <AnimatedBorderCard
                  highlightColor="234 179 8"
                  backgroundColor="10 10 10"
                  className="p-6 h-full backdrop-blur-sm"
                >
                  <div className="flex flex-col gap-3">
                    <div className="p-3 rounded-lg bg-yellow-500/10 group-hover:bg-yellow-500/20 transition-colors w-fit">
                      <feature.icon className="w-6 h-6 text-yellow-500" />
                    </div>
                    <div>
                      <div className="mb-1">
                        <ShinyText
                          text={feature.text}
                          speed={2}
                          color="#fbbf24"
                          shineColor="#ffffff"
                          className="text-lg font-bold"
                        />
                      </div>
                      <BlurText
                        text={feature.desc}
                        delay={30 + idx * 20}
                        className="text-sm text-white/50"
                      />
                    </div>
                  </div>
                </AnimatedBorderCard>
              </motion.div>
            ))}
          </motion.div>


          {/* Section Comment Acheter sur Discord */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl mx-auto w-full"
          >
            <AnimatedBorderCard
              highlightColor="88 101 242"
              backgroundColor="10 14 23"
              className="p-6 md:p-8 text-center space-y-5 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl"
            >
              <div className="inline-flex items-center justify-center p-3.5 bg-[#5865F2]/15 text-[#5865F2] rounded-2xl ring-1 ring-[#5865F2]/40 shadow-lg shadow-indigo-500/10 mx-auto">
                <MessageCircle className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl md:text-3xl font-bold text-white">
                  Comment obtenir votre clé VIP ?
                </h3>
                <p className="text-sm md:text-base text-white/70 max-w-lg mx-auto">
                  Pour acheter votre clé VIP annuelle à <span className="font-bold text-yellow-400 text-lg">10€</span>, tout se passe directement sur notre serveur Discord officiel !
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/10 max-w-md mx-auto text-left space-y-2.5">
                <div className="flex items-center gap-2.5 text-xs font-semibold text-white/90">
                  <span className="w-5 h-5 rounded-full bg-[#5865F2] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                  <span>Rejoignez le serveur Discord officiel Orvix</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs font-semibold text-white/90">
                  <span className="w-5 h-5 rounded-full bg-[#5865F2] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                  <span>Contactez l'administration ou ouvrez un ticket d'achat</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs font-semibold text-white/90">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                  <span>Recevez votre clé et collez-la ci-dessus pour l'activer !</span>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-base shadow-xl shadow-indigo-500/25 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Rejoindre notre Discord pour acheter ma clé (10€/an)</span>
                </a>
              </div>
            </AnimatedBorderCard>
          </motion.div>

          {/* Support Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex justify-center"
          >
            <AnimatedBorderCard
              backgroundColor="10 10 10"
              className="p-6 text-center space-y-3 backdrop-blur-sm max-w-xl"
              style={
                {
                  "--border-color": `conic-gradient(from var(--border-angle, 0deg),
                                    #ff0000, #ff8000, #ffff00, #00ff00, #0080ff, #8000ff, #ff00ff, #ff0000)`,
                } as React.CSSProperties
              }
            >
              <div className="inline-flex items-center justify-center p-2.5 bg-blue-500/10 rounded-full ring-1 ring-blue-500/40">
                <Heart className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                Votre contribution permet de financer les serveurs à haute vitesse et de préserver un accès 100% libre.
              </p>
            </AnimatedBorderCard>
          </motion.div>
        </div>
      </div>
    </SquareBackground>
  );
};

export default VipPage;

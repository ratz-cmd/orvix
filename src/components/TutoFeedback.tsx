import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ThumbsUp, ThumbsDown, CheckCircle2, Loader2 } from 'lucide-react';
import TurnstileWidget from './TurnstileWidget';
import { submitHelpFeedback } from '../services/helpFeedbackService';

const STORAGE_PREFIX = 'help_feedback_sent:';

type Vote = 'up' | 'down' | null;

interface TutoFeedbackProps {
  slug: string;
}

const TutoFeedback: React.FC<TutoFeedbackProps> = ({ slug }) => {
  const { t } = useTranslation();
  const storageKey = STORAGE_PREFIX + slug;
  const alreadySent =
    typeof window !== 'undefined' && !!localStorage.getItem(storageKey);

  const [pendingVote, setPendingVote] = useState<Vote>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [error, setError] = useState<string | null>(null);

  const pick = (vote: 'up' | 'down') => {
    if (sent || submitting) return;
    setPendingVote(vote);
    setError(null);
  };

  const submit = async () => {
    if (!pendingVote || !turnstileToken || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitHelpFeedback({
        slug,
        helpful: pendingVote === 'up',
        turnstileToken,
      });
      localStorage.setItem(storageKey, pendingVote);
      setSent(true);
    } catch {
      setError(t('help.feedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-10 relative">
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 flex items-center gap-3 text-green-300"
          >
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                delay: 0.08,
                type: 'spring',
                stiffness: 260,
                damping: 14,
              }}
              className="shrink-0"
              aria-hidden="true"
            >
              <CheckCircle2 className="w-5 h-5" />
            </motion.span>
            <p className="text-sm">{t('help.feedback.thanks')}</p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >
            <p className="text-sm font-semibold text-white mb-3">
              {t('help.feedback.question')}
            </p>
            <div className="flex flex-wrap gap-3 mb-4">
              <button
                type="button"
                onClick={() => pick('up')}
                disabled={submitting}
                aria-pressed={pendingVote === 'up'}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  pendingVote === 'up'
                    ? 'border-green-500/60 bg-green-500/15 text-green-300'
                    : 'border-white/15 bg-white/5 text-zinc-300 hover:border-green-500/40 hover:text-green-300'
                }`}
              >
                <ThumbsUp className="w-4 h-4" aria-hidden="true" />
                {t('help.feedback.yes')}
              </button>
              <button
                type="button"
                onClick={() => pick('down')}
                disabled={submitting}
                aria-pressed={pendingVote === 'down'}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  pendingVote === 'down'
                    ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
                    : 'border-white/15 bg-white/5 text-zinc-300 hover:border-blue-500/40 hover:text-blue-300'
                }`}
              >
                <ThumbsDown className="w-4 h-4" aria-hidden="true" />
                {t('help.feedback.no')}
              </button>
            </div>

            <div className="space-y-3">
              <TurnstileWidget
                onTokenChange={setTurnstileToken}
                action={`help-feedback-${slug}`}
                theme="dark"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!pendingVote || !turnstileToken || submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
              >
                {submitting && (
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {t('help.feedback.submit')}
              </button>
              {error && <p className="text-sm text-blue-400">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TutoFeedback;

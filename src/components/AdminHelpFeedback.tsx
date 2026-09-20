import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { ThumbsUp, ThumbsDown, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

interface StatRow {
  slug: string;
  up: number;
  down: number;
  total: number;
  ratio: number;
}

const MAIN_API = import.meta.env.VITE_MAIN_API || '';

const AdminHelpFeedback: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get<{ stats: StatRow[] }>(
        `${MAIN_API}/api/help/feedback/stats`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          timeout: 15000,
        },
      );
      setStats(res.data.stats || []);
    } catch {
      setError(t('admin.helpFeedback.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const up = stats.reduce((acc, s) => acc + s.up, 0);
    const down = stats.reduce((acc, s) => acc + s.down, 0);
    return { up, down, total: up + down };
  }, [stats]);

  const ratioClass = (ratio: number, total: number): string => {
    if (total < 3) return 'text-zinc-400';
    if (ratio >= 0.8) return 'text-green-400';
    if (ratio >= 0.5) return 'text-amber-400';
    return 'text-blue-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <ThumbsUp className="w-4 h-4 text-green-400" />
          <span className="font-semibold text-white">{totals.up}</span>
          <span>{t('admin.helpFeedback.totalUp')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <ThumbsDown className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-white">{totals.down}</span>
          <span>{t('admin.helpFeedback.totalDown')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>{t('admin.helpFeedback.totalVotes')}</span>
          <span className="font-semibold text-white">{totals.total}</span>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-sm text-zinc-200 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {t('admin.helpFeedback.refresh')}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && !loading && stats.length === 0 && (
        <p className="text-sm text-zinc-400 py-6 text-center">
          {t('admin.helpFeedback.noData')}
        </p>
      )}

      {stats.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-zinc-400 uppercase text-xs tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">
                  {t('admin.helpFeedback.colSlug')}
                </th>
                <th
                  className="text-right px-4 py-2.5 font-semibold"
                  aria-label={t('admin.helpFeedback.colUp')}
                >
                  <ThumbsUp
                    className="w-4 h-4 text-green-400 inline-block"
                    aria-hidden="true"
                  />
                </th>
                <th
                  className="text-right px-4 py-2.5 font-semibold"
                  aria-label={t('admin.helpFeedback.colDown')}
                >
                  <ThumbsDown
                    className="w-4 h-4 text-blue-400 inline-block"
                    aria-hidden="true"
                  />
                </th>
                <th className="text-right px-4 py-2.5 font-semibold">
                  {t('admin.helpFeedback.colTotal')}
                </th>
                <th className="text-right px-4 py-2.5 font-semibold">
                  {t('admin.helpFeedback.colRatio')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stats.map((row) => (
                <tr key={row.slug} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5">
                    <a
                      href={`/help/${row.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-zinc-200 hover:text-white hover:underline"
                    >
                      {row.slug}
                    </a>
                  </td>
                  <td className="text-right px-4 py-2.5 text-green-400 tabular-nums">
                    {row.up}
                  </td>
                  <td className="text-right px-4 py-2.5 text-blue-400 tabular-nums">
                    {row.down}
                  </td>
                  <td className="text-right px-4 py-2.5 text-zinc-300 tabular-nums">
                    {row.total}
                  </td>
                  <td
                    className={`text-right px-4 py-2.5 font-semibold tabular-nums ${ratioClass(
                      row.ratio,
                      row.total,
                    )}`}
                  >
                    {(row.ratio * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminHelpFeedback;

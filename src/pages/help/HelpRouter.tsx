import { useLocation, Navigate } from 'react-router-dom';
import HelpHubPage from './HelpHubPage';
import { TUTO_REGISTRY } from './tutoRegistry';

/**
 * Single dispatcher route that replaces 5 individual <Route> entries in
 * App.tsx. Matches /help/* and resolves the slug against TUTO_REGISTRY.
 *
 *   /help            or /help/        → HelpHubPage
 *   /help/<slug>                      → registry entry's component
 *   /help/<unknown>                   → redirect to /help (canonical hub)
 *
 * Adding a new tuto = add one entry in tutoRegistry.tsx. No App.tsx change.
 */
const HelpRouter: React.FC = () => {
  const { pathname } = useLocation();
  // Strip the /help prefix and any leading/trailing slash
  const slug = pathname.replace(/^\/help\/?/, '').replace(/\/$/, '');

  if (!slug) {
    return <HelpHubPage />;
  }

  const entry = TUTO_REGISTRY.find((t) => t.slug === slug);
  if (!entry) {
    return <Navigate to="/help" replace />;
  }

  const Page = entry.component;
  return <Page />;
};

export default HelpRouter;

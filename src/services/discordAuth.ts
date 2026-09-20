import { DISCORD_CONFIG } from '../config/discord';
import { clearPendingAuthAction, setPendingAuthAuthorize, setPendingAuthLink } from '../utils/accountAuth';

interface DiscordLoginOptions {
  mode?: 'login' | 'link' | 'authorize';
  returnTo?: string;
  clientId?: string;
}

export const discordAuth = {
  login: (options: DiscordLoginOptions = {}) => {
    if (options.mode === 'link') {
      setPendingAuthLink('discord', options.returnTo);
    } else if (options.mode === 'authorize') {
      setPendingAuthAuthorize(
        options.returnTo || `${window.location.pathname}${window.location.search}`,
        options.clientId
      );
    } else {
      clearPendingAuthAction();
    }

    window.location.replace(`https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CONFIG.CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_CONFIG.REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(DISCORD_CONFIG.SCOPES.join(' '))}`);
  }
};

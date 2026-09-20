export const DOWNLOAD_HOSTS = [
  '1fichier',
  'Mega',
  'Uploaded',
  'RapidGator',
  'Google Drive',
  'Dropbox',
  'Autre',
] as const;

export const HOST_ICONS: Record<string, string> = {
  '1fichier': '/hosts/1fichier.svg',
  'Mega': '/hosts/mega.svg',
  'Uploaded': '/hosts/uploaded.svg',
  'RapidGator': '/hosts/rapidgator.svg',
  'Google Drive': '/hosts/gdrive.svg',
  'Dropbox': '/hosts/dropbox.svg',
};

export const GENERIC_HOST_ICON = '/hosts/generic.svg';

export function resolveHostIcon(host: string | null | undefined): string {
  if (!host) return GENERIC_HOST_ICON;
  return HOST_ICONS[host] || GENERIC_HOST_ICON;
}

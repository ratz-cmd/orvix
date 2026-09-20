export interface CountryOption {
    value: string;
    label: string;
}

const COUNTRY_CODES: string[] = [
    'US', 'FR', 'GB', 'JP', 'KR', 'ES', 'DE', 'IT', 'CN', 'IN',
    'CA', 'AU', 'BR', 'RU', 'SE', 'NO', 'DK', 'NL', 'MX', 'PL',
    'TR', 'TH', 'ID', 'PH', 'VN', 'AR', 'CO', 'ZA', 'EG', 'NG',
    'BE', 'CH', 'AT', 'IE', 'NZ', 'HK', 'TW', 'SA', 'AE', 'IL',
    'PT', 'FI', 'GR', 'CZ', 'HU', 'RO', 'UA',
];

const safeLocale = (locale: string | undefined | null): string => {
    const trimmed = (locale || '').trim();
    return trimmed.length > 0 ? trimmed : 'en';
};

/**
 * Returns a localized list of country options sorted by label.
 * @param locale - BCP 47 locale tag (e.g. 'en', 'fr', 'de')
 */
export function getCountries(locale: string): CountryOption[] {
    const effectiveLocale = safeLocale(locale);
    let names: Intl.DisplayNames | undefined;

    try {
        names = new Intl.DisplayNames([effectiveLocale, 'en'], { type: 'region' });
    } catch {
        try {
            names = new Intl.DisplayNames(['en'], { type: 'region' });
        } catch {
            names = undefined;
        }
    }

    const options = COUNTRY_CODES.map(code => {
        let label = code;
        if (names) {
            try {
                label = names.of(code) || code;
            } catch {
                label = code;
            }
        }
        return { value: code, label };
    });

    try {
        options.sort((a, b) => a.label.localeCompare(b.label, effectiveLocale));
    } catch {
        options.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    }

    return options;
}

/** @deprecated Use getCountries(locale) for localized labels */
export const countries: CountryOption[] = getCountries('fr');


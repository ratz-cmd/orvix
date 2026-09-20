export interface LanguageOption {
    value: string;
    label: string;
}

const LANGUAGE_CODES: string[] = [
    'af', 'sq', 'am', 'ar', 'hy', 'as', 'az', 'eu', 'be', 'bn',
    'bs', 'bg', 'my', 'ca', 'zh', 'cn', 'hr', 'cs', 'da', 'nl',
    'dz', 'en', 'et', 'fi', 'fr', 'gl', 'ka', 'de', 'el', 'gu',
    'he', 'hi', 'hu', 'is', 'id', 'it', 'ja', 'kn', 'kk', 'km',
    'ko', 'ku', 'ky', 'lo', 'lv', 'lt', 'lb', 'mk', 'ms', 'ml',
    'mt', 'mi', 'mr', 'mn', 'ne', 'no', 'fa', 'pl', 'pt', 'pa',
    'ro', 'ru', 'sr', 'si', 'sk', 'sl', 'es', 'sw', 'sv', 'ta',
    'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'cy', 'zu',
];

const safeLocale = (locale: string | undefined | null): string => {
    const trimmed = (locale || '').trim();
    return trimmed.length > 0 ? trimmed : 'en';
};

/**
 * Returns a localized list of language options sorted by label.
 * @param locale - BCP 47 locale tag (e.g. 'en', 'fr', 'de')
 */
export function getLanguages(locale: string): LanguageOption[] {
    const effectiveLocale = safeLocale(locale);
    let names: Intl.DisplayNames | undefined;

    try {
        names = new Intl.DisplayNames([effectiveLocale, 'en'], { type: 'language' });
    } catch {
        try {
            names = new Intl.DisplayNames(['en'], { type: 'language' });
        } catch {
            names = undefined;
        }
    }

    const options = LANGUAGE_CODES.map(code => {
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

/** @deprecated Use getLanguages(locale) for localized labels */
export const languages: LanguageOption[] = getLanguages('fr');



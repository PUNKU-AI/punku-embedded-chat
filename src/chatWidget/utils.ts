export function detectBrowserLanguage(availableLanguages: string[] = ['en', 'de']): string {
	// Get browser languages in order of preference
	const browserLanguages = navigator.languages || [navigator.language];

	for (const browserLang of browserLanguages) {
		// Extract the main language code (e.g., 'en' from 'en-US')
		const mainLangCode = browserLang.split('-')[0].toLowerCase();

		// Check if this language is available
		if (availableLanguages.includes(mainLangCode)) {
			return mainLangCode;
		}
	}

	// Default to English if no supported language is found
	return 'en';
}

import React from 'react';
import { Language, LANGUAGES } from '../translations';

// Each language in its own name.
const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  pl: 'Polski',
};

interface LanguageSwitcherProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ language, onLanguageChange }) => {
  return (
    <div className="cl-language-switcher">
      <select 
        value={language} 
        onChange={(e) => onLanguageChange(e.target.value as Language)}
        className="cl-language-select"
      >
        {LANGUAGES.map((code) => (
          <option key={code} value={code}>{LANGUAGE_NAMES[code]}</option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSwitcher;
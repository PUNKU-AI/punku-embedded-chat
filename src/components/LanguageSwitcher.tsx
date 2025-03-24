import React from 'react';
import { Language } from '../translations';

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
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </div>
  );
};

export default LanguageSwitcher;
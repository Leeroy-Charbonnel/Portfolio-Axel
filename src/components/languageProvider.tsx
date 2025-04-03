import React, { Component, ReactNode, createContext, useContext } from 'react';
import { Language } from '../types';
import { translations } from '../locales/translations';

export interface LanguageContextType {
  language: Language;
  t: (key: string) => string;
  toggleLanguage: () => void;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

interface LanguageProviderState {
  language: Language;
}

export class LanguageProvider extends Component<LanguageProviderProps, LanguageProviderState> {
  constructor(props: LanguageProviderProps) {
    super(props);
    this.state = { language: 'en' };
  }

  toggleLanguage = () => {
    this.setState(prevState => ({
      language: prevState.language === 'en' ? 'fr' : 'en'
    }));
  };

  //Get nested translations
  t = (key: string): string => {
    const result = key.split('.').reduce((obj: any, k: string) =>
      (obj && typeof obj === 'object' && k in obj) ? obj[k] : null,
      translations[this.state.language]
    );
    return result !== null ? String(result) : `#TRANSLATION_NOT_FOUND(${key})`;
  };

  render() {
    const { children } = this.props;
    const { language } = this.state;

    const value: LanguageContextType = {
      language,
      t: this.t,
      toggleLanguage: this.toggleLanguage
    };

    return (
      <LanguageContext.Provider value={value}>
        {children}
      </LanguageContext.Provider>
    );
  }
}

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage - No context');
  return context;
};
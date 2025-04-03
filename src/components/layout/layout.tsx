import React, { Component, ReactNode } from 'react';
import Head from 'next/head';
import Navigation from './navigation';
import { LanguageContext, LanguageContextType } from '../languageProvider';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

class Layout extends Component<LayoutProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { children } = this.props;
    const { toggleLanguage, language, t } = this.context as LanguageContextType;
    const title = this.props.title || t("title");
    const sections: Array<[string, string]> = [
      ['home', 'Home'], 
      ['projects', 'Move3d'], 
      ['gallery', 'LayoutGrid'], 
      ['experience', 'FileUser']
    ];

    return (
      <div>
        <Head>
          <title>{title}</title>
          <meta name="description" content="Portfolio of Axel Offret, 3D Artist" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <button className="language-switch" onClick={toggleLanguage} aria-label="Toggle language">{language === 'en' ? 'FR / EN' : 'EN / FR'}</button>

        <Navigation sections={sections} />
        <main>{children}</main>
      </div>
    );
  }
}

export default Layout;
import React, { ReactNode } from 'react';
import Head from 'next/head';
import { useLanguage } from '../../hooks/useLanguage';
import Navigation from './navigation';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  title = 'Axel Offret - 3D Artist Portfolio' 
}) => {
  const { toggleLanguage, language } = useLanguage();
  const sections = ['home', 'projects', 'gallery', 'experience'];

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="Portfolio of Axel Offret, 3D Artist" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <button 
        className="language-switch" 
        onClick={toggleLanguage}
        aria-label="Toggle language"
      >
        {language === 'en' ? 'FR' : 'EN'} / {language === 'en' ? 'EN' : 'FR'}
      </button>

      <Navigation sections={sections} />

      <main>{children}</main>
    </>
  );
};

export default Layout;
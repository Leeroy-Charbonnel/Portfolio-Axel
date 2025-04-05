import React from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Axel Offret - 3D Artist Portfolio</title>
        <meta name="description" content="Portfolio of Axel Offret, 3D Artist showcasing 3D modeling and design work." />
        <link rel="icon" href="/favicon.ico" />
        <script src="https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js"></script>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
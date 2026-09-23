import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Max Showdown Trivia',
  description: 'Real-time live trivia platform for venues',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${montserrat.variable}`}>
      <body className={`${montserrat.className} antialiased bg-background text-foreground`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

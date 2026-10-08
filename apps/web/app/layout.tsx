import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth/AuthContext';

export const metadata: Metadata = {
  title: 'Real-Time Collaborative Whiteboard',
  description: 'Production-grade Real-Time Collaborative Whiteboard built with Next.js, NestJS, and TypeScript',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full">
      <body className="h-full w-full overflow-hidden antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

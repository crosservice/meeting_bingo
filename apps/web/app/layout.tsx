import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { SocketProvider } from '@/lib/socket';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meeting Bingo',
  description: 'Real-time bingo games for live meetings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>
          <SocketProvider>{children}</SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

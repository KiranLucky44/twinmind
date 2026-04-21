import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopBar from "./components/TopBar";
import { AppProvider } from "./context/AppContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'TwinMind — AI Conversation Intelligence',
  description: 'Real-time transcription and AI-powered conversation suggestions. Record, transcribe, and get instant insights from your conversations.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className={`${geistSans.variable} ${geistMono.variable} h-[100dvh] flex flex-col bg-[#0b1220] antialiased`}>
        <AppProvider>
          <TopBar />
          <div className="flex flex-col h-full bg-transparent">
            {children}
          </div>
        </AppProvider>
      </body>
    </html>
  );
}

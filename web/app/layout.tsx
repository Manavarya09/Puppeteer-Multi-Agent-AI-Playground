import type { Metadata } from 'next'
import './globals.css'
import { Footer, Header } from '@/components/Chrome'

export const metadata: Metadata = {
  title: 'Puppeteer — Multi-Agent AI Orchestration',
  description:
    'Puppeteer — Multi-agent AI orchestration. RL-driven coordination of specialist agents for tasks no single model can solve alone.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500&family=Geist:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}

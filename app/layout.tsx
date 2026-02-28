import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Domino Royal - Bangladeshi Multiplayer Dominoes",
  description:
    "Premium Bangladeshi Dominoes experience with real-time multiplayer. Play with friends online!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

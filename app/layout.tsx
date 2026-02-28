import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
    title: "গাফলা GAFLA - বাংলাদেশের সেরা অনলাইন ডমিনো গেম",
    description:
        "গাফলা — বাংলাদেশের জনপ্রিয় ডমিনো খেলা। বন্ধুদের সাথে রিয়েল-টাইমে অনলাইনে খেলুন। Premium Bangladeshi Domino Experience.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="bn">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </head>
            <body>
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoboPad",
  description: "Generate gobo variants in your browser.",
  icons: {
    icon: "/GoboPad_Logo.png",
    apple: "/GoboPad_Logo.png"
  }
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

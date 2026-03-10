// This root layout is kept minimal as the actual layout is in [locale]/layout.tsx
// The middleware will redirect all requests to the appropriate locale path
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Root layout must have html and body tags
  return (
    <html suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

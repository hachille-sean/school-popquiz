import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pop Quiz",
  description: "Simple Quiz App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col font-sans">
        {/* Fatal Error Display for Mobile Troubleshooting */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
            window.onerror = function(msg, url, lineNo, columnNo, error) {
              var d = document.createElement('div');
              d.style.cssText = "position:fixed;top:0;left:0;width:100%;background:rgba(220,38,38,0.9);color:white;z-index:999999;padding:15px;font-size:12px;font-family:monospace;word-break:break-all;";
              d.innerHTML = "<b>FATAL ERROR:</b> " + msg + "<br/>At: " + url + ":" + lineNo + ":" + columnNo + "<br/>" + (error ? error.stack : "");
              document.body.appendChild(d);
              return false;
            };
            window.addEventListener('unhandledrejection', function(event) {
              var d = document.createElement('div');
              d.style.cssText = "position:fixed;top:50px;left:0;width:100%;background:rgba(185,28,28,0.9);color:white;z-index:999999;padding:15px;font-size:12px;font-family:monospace;word-break:break-all;";
              d.innerHTML = "<b>PROMISE REJECTION:</b> " + event.reason;
              document.body.appendChild(d);
            });
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}

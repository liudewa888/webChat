import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "网传 · 手机电脑互传工具",
  description: "同一房间码内,手机与电脑互传文件、文本、截图,支持 P2P 直连",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// iOS 14(Safari 14.1)缺少 React 19 内部用到的 Object.hasOwn / AggregateError,
// 内联在 head 里、先于所有 bundle 执行
const LEGACY_POLYFILLS = `(function(){
if(!Object.hasOwn){Object.defineProperty(Object,'hasOwn',{writable:true,configurable:true,value:function(o,p){return Object.prototype.hasOwnProperty.call(o,p)}})}
if(typeof AggregateError==='undefined'){window.AggregateError=function(e,m){var err=new Error(m||'AggregateError');err.errors=e||[];return err}}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: LEGACY_POLYFILLS }} />
      </head>
      <body className="flex min-h-full flex-col bg-white text-neutral-900">{children}</body>
    </html>
  );
}

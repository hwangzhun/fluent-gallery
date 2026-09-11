import React from 'react';
import { ArrowUp } from 'lucide-react';

export function GalleryFooter() {
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  return <footer id="gallery-note" className="gallery-footer gallery-container">
    <div className="gallery-footer-note"><p className="gallery-eyebrow">A NOTE FROM FLUENT</p><p>城市向前，光线移动，人群经过。<br /><span>一些事情消失了，一些事情只是换了一种方式继续存在。</span></p><div>光在流动，时间在流动。<br />照片把片刻，暂时留在这里。</div></div>
    <div className="gallery-footer-signature"><span className="gallery-footer-wordmark">Fluent<span> Gallery.</span></span><p>A visual journal in motion.</p><button onClick={scrollToTop}>回到开始 <ArrowUp size={15} /></button></div>
    <div className="gallery-footer-bottom"><span>© 2026 Fluent Gallery. Created by <a href="https://github.com/hwangzhun" target="_blank" rel="noopener noreferrer">Hwangzhun</a>. All rights reserved.</span><span>Fluent 记录这些经过。</span><span>LIGHT &amp; TIME, IN MOTION</span></div>
  </footer>;
}

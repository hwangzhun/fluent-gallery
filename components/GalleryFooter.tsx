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
    <div className="gallery-footer-note"><p className="gallery-eyebrow">A NOTE FROM THE GALLERY</p><p>世界很快，<br /><span>我们慢慢看。</span></p><div>摄影是与日常的一场温柔对话。<br />谢谢你在这里，为一个瞬间停留。</div></div>
    <div className="gallery-footer-signature"><span className="gallery-footer-wordmark">Fluent<span> Gallery.</span></span><p>A small collection of things worth seeing.</p><button onClick={scrollToTop}>回到开始 <ArrowUp size={15} /></button></div>
    <div className="gallery-footer-bottom"><span>© 2026 Fluent Gallery. Created by <a href="https://github.com/hwangzhun" target="_blank" rel="noopener noreferrer">Hwangzhun</a>. All rights reserved.</span><span>以影像，珍藏所见。</span><span>MADE OF LIGHT &amp; TIME</span></div>
  </footer>;
}

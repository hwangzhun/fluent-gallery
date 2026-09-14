import React from 'react';
import { ArrowUp } from 'lucide-react';
import { analytics } from '../api/analyticsService';

export function GalleryFooter() {
  const currentYear = new Date().getFullYear();
  const scrollToTop = () => {
    analytics.navigation('top', 'footer');
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  return <footer id="gallery-note" className="gallery-footer gallery-container">
    <p className="gallery-eyebrow gallery-footer-eyebrow">A NOTE FROM FLUENT</p>
    <div className="gallery-footer-note"><p className="gallery-footer-long-note">城市向前，光线移动，人群经过。<br /><span>一些事情消失了，一些事情只是换了一种方式继续存在。</span></p><div className="gallery-footer-detail">光在流动，时间在流动。<br />照片把片刻，暂时留在这里。</div><p className="gallery-footer-mobile-note">光在流动，时间在流动。<br />照片把片刻，暂时留在这里。</p></div>
    <div className="gallery-footer-signature"><span className="gallery-footer-wordmark">Fluent<span> Gallery.</span></span><p>A visual journal in motion.</p></div>
    <button className="gallery-footer-back" onClick={scrollToTop}>回到开始 <ArrowUp size={15} /></button>
    <div className="gallery-footer-bottom"><span>© {currentYear} Fluent Gallery. Created by Hwangzhun. All rights reserved.</span><span>Fluent 记录这些经过。</span><span>LIGHT &amp; TIME, IN MOTION</span></div>
  </footer>;
}

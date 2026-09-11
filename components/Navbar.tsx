import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import brandUrl from '../logo/brand.svg';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const section = (id: string) => {
    if (location.pathname !== '/') navigate('/', { state: { scrollTo: id } });
    else document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return <header className="gallery-nav gallery-container">
    <Link to="/" className="gallery-brand" aria-label="Fluent Gallery 首页"><img src={brandUrl} className="gallery-brand-image" alt="Fluent Gallery" /></Link>
    <nav aria-label="画廊导航">
      <button onClick={() => section('collection')} aria-current={location.pathname === '/' ? 'page' : undefined}>作品集 {location.pathname === '/' && <span className="nav-dot" />}</button>
      <Link to="/albums" aria-current={location.pathname === '/albums' ? 'page' : undefined}>画册 {location.pathname === '/albums' && <span className="nav-dot" />}</Link>
      <button onClick={() => section('gallery-note')}>关于画廊</button>
      <Link to="/admin" className="gallery-admin-link">工作室 <ArrowUpRight size={14} /></Link>
    </nav>
  </header>;
};

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Navbar: React.FC = () => (
  <header className="gallery-nav gallery-container">
    <Link to="/" className="gallery-brand" aria-label="Fluent Gallery 首页">
      <span className="gallery-brand-mark" aria-hidden="true">f<span>.</span></span>
      <span>Fluent Gallery<small>光 影 · 日 常 · 片 刻</small></span>
    </Link>
    <nav aria-label="画廊导航">
      <button onClick={() => document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })}>作品集 <span className="nav-dot" /></button>
      <button onClick={() => document.getElementById('gallery-note')?.scrollIntoView({ behavior: 'smooth' })}>关于画廊</button>
      <Link to="/admin" className="gallery-admin-link">工作室 <ArrowUpRight size={14} /></Link>
    </nav>
  </header>
);

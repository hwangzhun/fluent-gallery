import React, { useEffect, useState } from 'react';
import { FilterState } from '../types';
import { Camera, Filter, X, Shield, LayoutGrid } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { tagService } from '../services/tagService';

interface NavbarProps {
  filter: FilterState;
  onFilterChange: (newFilter: Partial<FilterState>) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ filter, onFilterChange }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const isAdmin = location.pathname === '/admin';

  // 从 API 加载标签和年份
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        setLoading(true);
        const [tags, years] = await Promise.all([
          tagService.getAllTagNames(),
          tagService.getAvailableYears()
        ]);
        setAvailableTags(tags);
        setAvailableYears(years);
      } catch (error) {
        console.error('加载筛选数据失败:', error);
        // 如果加载失败，使用空数组
        setAvailableTags([]);
        setAvailableYears([]);
      } finally {
        setLoading(false);
      }
    };

    if (!isAdmin) {
      loadFilterData();
    }
  }, [isAdmin]);

  return (
    <nav className="sticky top-0 z-40 w-full bg-white/70 backdrop-blur-md border-b border-gray-200 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="p-2 bg-blue-600 rounded-lg text-white group-hover:bg-blue-700 transition-colors">
              <Camera size={20} />
            </div>
            <span className="font-semibold text-xl tracking-tight text-gray-900">
              Fluent<span className="font-light text-gray-500">Gallery</span>
            </span>
          </Link>

          {/* Desktop Controls */}
          {!isAdmin && (
            <div className="hidden md:flex items-center gap-4">
              {/* Year Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500">年份：</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => onFilterChange({ year: null })}
                    className={`px-3 py-1 text-sm rounded-full transition-all ${
                      filter.year === null
                        ? 'bg-gray-900 text-white shadow-md'
                        : 'bg-transparent text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    全部
                  </button>
                  {availableYears.map(year => (
                    <button
                      key={year}
                      onClick={() => onFilterChange({ year: filter.year === year ? null : year })}
                      className={`px-3 py-1 text-sm rounded-full transition-all ${
                        filter.year === year
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-transparent text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-6 w-px bg-gray-300 mx-2"></div>

              {/* Tag Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500">标签：</span>
                <select
                  value={filter.tag || ''}
                  onChange={(e) => onFilterChange({ tag: e.target.value || null })}
                  className="bg-gray-100 border-none rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-gray-200 transition-colors"
                >
                  <option value="">全部标签</option>
                  {availableTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Admin Toggle Link */}
          <div className="flex items-center gap-3">
             {isAdmin ? (
                <Link to="/" className="text-sm font-medium text-gray-600 hover:text-blue-600 flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-all">
                  <LayoutGrid size={16} />
                  查看图库
                </Link>
             ) : (
                <Link to="/admin" className="text-sm font-medium text-gray-400 hover:text-gray-800 flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-all">
                  <Shield size={16} />
                </Link>
             )}
            
            {/* Mobile Menu Button */}
            {!isAdmin && (
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="md:hidden p-2 text-gray-600 rounded-md hover:bg-gray-100"
              >
                {isMenuOpen ? <X size={24} /> : <Filter size={24} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && !isAdmin && (
        <div className="md:hidden border-t border-gray-200 bg-white/95 backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
          <div className="px-4 pt-2 pb-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">年份</h3>
              <div className="flex flex-wrap gap-2">
                 <button
                    onClick={() => { onFilterChange({ year: null }); setIsMenuOpen(false); }}
                    className={`px-3 py-1.5 text-sm rounded-full border ${
                      filter.year === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    全部
                  </button>
                {availableYears.map(year => (
                  <button
                    key={year}
                    onClick={() => { onFilterChange({ year: filter.year === year ? null : year }); setIsMenuOpen(false); }}
                    className={`px-3 py-1.5 text-sm rounded-full border ${
                      filter.year === year ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">标签</h3>
              <div className="flex flex-wrap gap-2">
                 <button
                    onClick={() => { onFilterChange({ tag: null }); setIsMenuOpen(false); }}
                    className={`px-3 py-1.5 text-sm rounded-md border ${
                      filter.tag === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    全部
                  </button>
                {availableTags.map(tag => (
                   <button
                    key={tag}
                    onClick={() => { onFilterChange({ tag: filter.tag === tag ? null : tag }); setIsMenuOpen(false); }}
                    className={`px-3 py-1.5 text-sm rounded-md border ${
                      filter.tag === tag ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
import React, { useEffect, useState } from 'react';
import { Grid2X2, LayoutGrid, X } from 'lucide-react';
import { FilterState } from '../types';
import { tagService } from '../services/tagService';
import { SelectMenu } from './SelectMenu';

interface GalleryFiltersProps {
  filter: FilterState;
  onFilterChange: (filter: Partial<FilterState>) => void;
  compact: boolean;
  onCompactChange: (compact: boolean) => void;
}

export const GalleryFilters: React.FC<GalleryFiltersProps> = ({ filter, onFilterChange, compact, onCompactChange }) => {
  const [tags, setTags] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  useEffect(() => {
    let active = true;
    Promise.all([tagService.getAllTagNames(), tagService.getAvailableYears()])
      .then(([nextTags, nextYears]) => { if (active) { setTags(nextTags); setYears(nextYears); } })
      .catch(error => console.error('加载筛选选项失败', error));
    return () => { active = false; };
  }, []);

  return (
    <div className="gallery-filters">
      <div className="gallery-filter-tags" aria-label="按主题筛选">
        <button className={filter.tag === null ? 'is-active' : ''} aria-pressed={filter.tag === null} onClick={() => onFilterChange({ tag: null })}>全部作品</button>
        {tags.map(tag => <button key={tag} className={filter.tag === tag ? 'is-active' : ''} aria-pressed={filter.tag === tag} onClick={() => onFilterChange({ tag })}>{tag}</button>)}
      </div>
      <div className="gallery-filter-tools">
        <SelectMenu className="gallery-year" ariaLabel="拍摄年份" value={filter.year ?? ''} onChange={value => onFilterChange({ year: value === '' ? null : Number(value) })} options={[{ value: '', label: '所有年份' }, ...years.map(year => ({ value: year, label: String(year) }))]} />
        {(filter.year !== null || filter.tag !== null) && <button className="gallery-clear" onClick={() => onFilterChange({ year: null, tag: null })} aria-label="清除所有筛选"><X size={15} /></button>}
        <div className="gallery-layout-toggle" role="group" aria-label="作品布局">
          <button aria-label="舒展布局" aria-pressed={!compact} onClick={() => onCompactChange(false)}><Grid2X2 size={16} strokeWidth={1.4} /></button>
          <button aria-label="紧凑布局" aria-pressed={compact} onClick={() => onCompactChange(true)}><LayoutGrid size={16} strokeWidth={1.4} /></button>
        </div>
      </div>
    </div>
  );
};

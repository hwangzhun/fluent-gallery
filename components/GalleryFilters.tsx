import React, { useEffect, useRef, useState } from 'react';
import { Grid2X2, LayoutGrid, X } from 'lucide-react';
import { FilterState } from '../types';
import { tagService } from '../api/tagService';
import { SelectMenu } from './SelectMenu';
import { analytics } from '../api/analyticsService';

interface GalleryFiltersProps {
  filter: FilterState;
  onFilterChange: (filter: Partial<FilterState>) => void;
  compact: boolean;
  onCompactChange: (compact: boolean) => void;
}

export const GalleryFilters: React.FC<GalleryFiltersProps> = ({ filter, onFilterChange, compact, onCompactChange }) => {
  const [tags, setTags] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [draggingTags, setDraggingTags] = useState(false);
  const tagScrollerRef = useRef<HTMLDivElement>(null);
  const tagDragRef = useRef({ pointerId: -1, startX: 0, scrollLeft: 0, moved: false });
  const suppressTagClickRef = useRef(false);
  useEffect(() => {
    let active = true;
    Promise.all([tagService.getAllTagNames(), tagService.getAvailableYears()])
      .then(([nextTags, nextYears]) => { if (active) { setTags(nextTags); setYears(nextYears); } })
      .catch(error => console.error('加载筛选选项失败', error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const scroller = tagScrollerRef.current;
    if (!scroller) return;
    const handleWheel = (event: WheelEvent) => {
      if (scroller.scrollWidth <= scroller.clientWidth) return;

      const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (rawDelta === 0) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientWidth : 1;
      const delta = rawDelta * unit;
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      const nextScroll = Math.max(0, Math.min(maxScroll, scroller.scrollLeft + delta));
      if (nextScroll === scroller.scrollLeft) return;

      event.preventDefault();
      scroller.scrollLeft = nextScroll;
    };
    scroller.addEventListener('wheel', handleWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', handleWheel);
  }, []);

  const handleTagPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget;
    if (event.button !== 0 || scroller.scrollWidth <= scroller.clientWidth) return;
    tagDragRef.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: scroller.scrollLeft, moved: false };
    scroller.setPointerCapture?.(event.pointerId);
  };

  const handleTagPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = tagDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      setDraggingTags(true);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = drag.scrollLeft - distance;
  };

  const finishTagDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = tagDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressTagClickRef.current = true;
      window.setTimeout(() => { suppressTagClickRef.current = false; }, 0);
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    tagDragRef.current.pointerId = -1;
    setDraggingTags(false);
  };

  return (
    <div className="gallery-filters">
      <div className="gallery-filter-tags" role="group" aria-label="按主题筛选">
        <button className={`gallery-filter-all${filter.tag === null ? ' is-active' : ''}`} aria-pressed={filter.tag === null} onClick={() => { analytics.galleryFilter('tag', 'all'); onFilterChange({ tag: null }); }}>全部作品</button>
        <div
          ref={tagScrollerRef}
          className={`gallery-filter-scroll${draggingTags ? ' is-dragging' : ''}`}
          onPointerDown={handleTagPointerDown}
          onPointerMove={handleTagPointerMove}
          onPointerUp={finishTagDrag}
          onPointerCancel={finishTagDrag}
          onClickCapture={event => {
            if (!suppressTagClickRef.current) return;
            event.preventDefault();
            event.stopPropagation();
            suppressTagClickRef.current = false;
          }}
          onDragStart={event => event.preventDefault()}
        >
          {tags.map(tag => <button key={tag} className={filter.tag === tag ? 'is-active' : ''} aria-pressed={filter.tag === tag} onClick={() => { analytics.galleryFilter('tag', tag); onFilterChange({ tag }); }}>{tag}</button>)}
        </div>
      </div>
      <div className="gallery-filter-tools">
        <SelectMenu className="gallery-year" ariaLabel="拍摄年份" value={filter.year ?? ''} onChange={value => { analytics.galleryFilter('year', value === '' ? 'all' : String(value)); onFilterChange({ year: value === '' ? null : Number(value) }); }} options={[{ value: '', label: '所有年份' }, ...years.map(year => ({ value: year, label: String(year) }))]} />
        {(filter.year !== null || filter.tag !== null) && <button className="gallery-clear" onClick={() => { analytics.galleryFilter('all', 'all'); onFilterChange({ year: null, tag: null }); }} aria-label="清除所有筛选"><X size={15} /></button>}
        <div className="gallery-layout-toggle" role="group" aria-label="作品布局">
          <button aria-label="舒展布局" aria-pressed={!compact} onClick={() => { analytics.galleryLayout('expanded'); onCompactChange(false); }}><Grid2X2 size={16} strokeWidth={1.4} /></button>
          <button aria-label="紧凑布局" aria-pressed={compact} onClick={() => { analytics.galleryLayout('compact'); onCompactChange(true); }}><LayoutGrid size={16} strokeWidth={1.4} /></button>
        </div>
      </div>
    </div>
  );
};

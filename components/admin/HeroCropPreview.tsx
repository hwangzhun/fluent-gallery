import { type HeroAspectRatio } from '../../shared/hero';
import React, { useEffect, useRef } from 'react';
import type { Photo } from '../../types';
import { HeroArtwork } from '../HeroArtwork';

interface HeroCropPreviewProps {
  photo: Photo | null;
  fit: 'contain' | 'cover';
  aspectRatio: HeroAspectRatio;
  positionX: number;
  positionY: number;
  scale: number;
  onViewChange: (x: number, y: number, scale: number) => void;
  onReset: () => void;
}

interface Point { x: number; y: number }
interface DragState extends Point { pointerId: number; positionX: number; positionY: number; overflowX: number; overflowY: number }
interface PinchState { distance: number; scale: number; positionX: number; positionY: number }

const clampPosition = (value: number) => Math.min(100, Math.max(0, Math.round(value * 100) / 100));
const clampScale = (value: number) => Math.min(3, Math.max(1, Math.round(value * 1000) / 1000));
const distanceBetween = (first: Point, second: Point) => Math.hypot(second.x - first.x, second.y - first.y);

export function HeroCropPreview({ photo, fit, aspectRatio, positionX, positionY, scale, onViewChange, onReset }: HeroCropPreviewProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const drag = useRef<DragState | null>(null);
  const pinch = useRef<PinchState | null>(null);
  const view = useRef({ positionX, positionY, scale });
  view.current = { positionX, positionY, scale };
  const canAdjust = Boolean(photo && fit === 'cover');
  useEffect(() => { pointers.current.clear(); drag.current = null; pinch.current = null; }, [photo?.id, fit, aspectRatio]);

  const emitView = (nextX: number, nextY: number, nextScale: number) => {
    const next = { positionX: clampPosition(nextX), positionY: clampPosition(nextY), scale: clampScale(nextScale) };
    view.current = next;
    onViewChange(next.positionX, next.positionY, next.scale);
  };

  const getOverflow = (frame: HTMLDivElement, nextScale = view.current.scale) => {
    if (!photo) return { x: 0, y: 0 };
    const viewport = frame.querySelector<HTMLElement>('.artwork-image')?.getBoundingClientRect();
    if (!viewport?.width || !viewport.height || !photo.width || !photo.height) return { x: 0, y: 0 };
    const imageAspect = photo.width / photo.height;
    const viewportAspect = viewport.width / viewport.height;
    const baseWidth = imageAspect > viewportAspect ? viewport.height * imageAspect : viewport.width;
    const baseHeight = imageAspect > viewportAspect ? viewport.height : viewport.width / imageAspect;
    return { x: Math.max(0, baseWidth * nextScale - viewport.width), y: Math.max(0, baseHeight * nextScale - viewport.height) };
  };

  const beginDrag = (frame: HTMLDivElement, pointerId: number, point: Point) => {
    const overflow = getOverflow(frame);
    drag.current = { pointerId, ...point, positionX: view.current.positionX, positionY: view.current.positionY, overflowX: overflow.x, overflowY: overflow.y };
  };

  const startGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!photo || fit !== 'cover') return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const active = Array.from(pointers.current.entries());
    if (active.length === 1) {
      beginDrag(event.currentTarget, event.pointerId, active[0][1]);
      pinch.current = null;
    } else if (active.length === 2) {
      drag.current = null;
      pinch.current = { distance: distanceBetween(active[0][1], active[1][1]), scale: view.current.scale, positionX: view.current.positionX, positionY: view.current.positionY };
    }
  };

  const moveGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active: Point[] = Array.from(pointers.current.values());
    if (active.length >= 2 && pinch.current) {
      const currentDistance = distanceBetween(active[0], active[1]);
      if (pinch.current.distance > 0) emitView(pinch.current.positionX, pinch.current.positionY, pinch.current.scale * (currentDistance / pinch.current.distance));
      return;
    }
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const nextX = current.overflowX > 0 ? current.positionX - ((event.clientX - current.x) / current.overflowX) * 100 : current.positionX;
    const nextY = current.overflowY > 0 ? current.positionY - ((event.clientY - current.y) / current.overflowY) * 100 : current.positionY;
    emitView(nextX, nextY, view.current.scale);
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining = Array.from(pointers.current.entries());
    pinch.current = null;
    drag.current = null;
    if (remaining.length === 1) beginDrag(event.currentTarget, remaining[0][0], remaining[0][1]);
  };

  const zoomWithWheel = (event: WheelEvent) => {
    if (!canAdjust) return;
    event.preventDefault();
    emitView(view.current.positionX, view.current.positionY, view.current.scale * Math.exp(-event.deltaY * 0.0015));
  };

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !canAdjust) return;
    frame.addEventListener('wheel', zoomWithWheel, { passive: false });
    return () => frame.removeEventListener('wheel', zoomWithWheel);
  }, [canAdjust, onViewChange]);

  const adjustWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!photo || fit !== 'cover') return;
    const step = event.shiftKey ? 10 : 2;
    const overflow = getOverflow(event.currentTarget);
    let nextX = view.current.positionX;
    let nextY = view.current.positionY;
    let nextScale = view.current.scale;
    if (overflow.x > 0 && event.key === 'ArrowLeft') nextX -= step;
    if (overflow.x > 0 && event.key === 'ArrowRight') nextX += step;
    if (overflow.y > 0 && event.key === 'ArrowUp') nextY -= step;
    if (overflow.y > 0 && event.key === 'ArrowDown') nextY += step;
    if (event.key === '+' || event.key === '=') nextScale += 0.1;
    if (event.key === '-') nextScale -= 0.1;
    if (nextX === view.current.positionX && nextY === view.current.positionY && nextScale === view.current.scale) return;
    event.preventDefault();
    emitView(nextX, nextY, nextScale);
  };

  return (
    <div className="hero-crop-preview">
      <HeroArtwork
        photo={photo}
        fit={fit}
        aspectRatio={aspectRatio}
        positionX={fit === 'cover' ? positionX : 50}
        positionY={fit === 'cover' ? positionY : 50}
        scale={fit === 'cover' ? scale : 1}
        preview
        original={false}
        frameRef={frameRef}
        frameProps={photo ? {
          className: canAdjust ? 'is-draggable' : '',
          tabIndex: canAdjust ? 0 : undefined,
          role: canAdjust ? 'group' : undefined,
          'aria-label': canAdjust ? `调整 Hero 图片《${photo.title}》的显示区域` : undefined,
          onPointerDown: startGesture,
          onPointerMove: moveGesture,
          onPointerUp: endGesture,
          onPointerCancel: endGesture,
          onKeyDown: adjustWithKeyboard,
          onDragStart: event => event.preventDefault(),
        } : undefined}
      />
      {photo && <div className="hero-crop-controls">
        <p>{canAdjust ? '拖动移动位置 · 滚轮或双指缩放 · 方向键微调' : '完整显示模式会居中展示照片。'}</p>
        {canAdjust && <span className="hero-crop-scale" aria-live="polite">缩放 {Math.round(scale * 100)}%</span>}
        {canAdjust && <button type="button" onClick={onReset} disabled={positionX === 50 && positionY === 50 && scale === 1}>恢复居中</button>}
      </div>}
    </div>
  );
}

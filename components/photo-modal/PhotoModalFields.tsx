import { AlbumSelector } from '../admin/AlbumSelector';
import type { ReactNode } from 'react';
import { Aperture, Calendar, Camera, Copyright, Film, Gauge, MapPin, User } from 'lucide-react';
import { TagSelector } from '../TagSelector';
import type { BatchFieldKey, PhotoFormData } from './types';

interface SharedFieldToggleProps {
  field: BatchFieldKey;
  label: string;
  sharedFields?: Set<BatchFieldKey>;
  onToggleShared?: (field: BatchFieldKey) => void;
  disabled?: boolean;
}

export function SharedFieldToggle({
  field,
  label,
  sharedFields,
  onToggleShared,
  disabled,
}: SharedFieldToggleProps) {
  if (!sharedFields || !onToggleShared) return null;
  const checked = sharedFields.has(field);

  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-normal text-gray-500">
      <span>公共</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggleShared(field)}
        disabled={disabled}
        aria-label={`将${label}设为公共字段`}
        className="peer sr-only"
      />
      <span className="relative h-4 w-7 rounded-full bg-gray-200 transition-colors peer-checked:bg-blue-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-3" />
    </label>
  );
}

interface FieldLabelProps extends SharedFieldToggleProps {
  icon?: ReactNode;
  children: ReactNode;
}

function FieldLabel({ icon, children, ...toggleProps }: FieldLabelProps) {
  return (
    <div className="mb-1 flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        {icon}
        {children}
      </label>
      <SharedFieldToggle {...toggleProps} />
    </div>
  );
}

interface PhotoPreviewProps {
  previewUrl: string | null;
  title: string;
}

export function PhotoPreview({ previewUrl, title }: PhotoPreviewProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">照片预览</label>
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        {previewUrl && (
          <img src={previewUrl} alt={title} className="w-full h-48 object-cover rounded-lg" />
        )}
      </div>
    </div>
  );
}

interface PhotoBasicFieldsProps {
  data: PhotoFormData;
  onChange: (field: BatchFieldKey, value: string | number | string[]) => void;
  sharedFields?: Set<BatchFieldKey>;
  onToggleShared?: (field: BatchFieldKey) => void;
  disabled?: boolean;
  editorKey?: string;
}

export function PhotoBasicFields({
  data,
  onChange,
  sharedFields,
  onToggleShared,
  disabled,
  editorKey,
}: PhotoBasicFieldsProps) {
  const toggleProps = { sharedFields, onToggleShared, disabled };

  return (
    <div className="space-y-4">
      <div><FieldLabel field="albumIds" label="画册" {...toggleProps}>所属画册</FieldLabel><AlbumSelector value={data.albumIds || []} disabled={disabled} onChange={ids => onChange('albumIds', ids)} /></div>
      <div>
        <FieldLabel field="title" label="标题" {...toggleProps}>标题</FieldLabel>
        <input
          type="text"
          aria-label="标题"
          value={data.title}
          onChange={(event) => onChange('title', event.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
          required
        />
      </div>

      <div>
        <FieldLabel field="year" label="年份" {...toggleProps}>年份</FieldLabel>
        <div className="relative">
          <Calendar size={14} className="absolute left-3 top-3 text-gray-400" />
          <input
            type="number"
            aria-label="年份"
            value={data.year}
            onChange={(event) => onChange('year', Number(event.target.value))}
            disabled={disabled}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            required
          />
        </div>
      </div>

      <TagSelector
        value={data.tags}
        onChange={(value) => onChange('tags', value)}
        placeholder="输入标签或从列表选择..."
        disabled={disabled}
        labelAction={<SharedFieldToggle field="tags" label="标签" {...toggleProps} />}
        resetKey={editorKey}
      />
    </div>
  );
}

interface PhotoExifFieldsProps extends PhotoBasicFieldsProps {
  loadingExif?: boolean;
  compact?: boolean;
}

export function PhotoExifFields({
  data,
  onChange,
  sharedFields,
  onToggleShared,
  disabled,
  loadingExif,
  compact = false,
}: PhotoExifFieldsProps) {
  const toggleProps = { sharedFields, onToggleShared, disabled };
  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100';

  return (
    <div className={compact ? '' : 'border-t border-gray-200 pt-6'}>
      {!compact && (
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Camera size={18} />
          EXIF 信息
        </h3>
      )}

      {loadingExif ? (
        <div className="text-sm text-gray-500 py-4">正在解析 EXIF 数据...</div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${compact ? '' : 'md:grid-cols-2'}`}>
          <div>
            <FieldLabel field="exif.camera" label="相机型号" icon={<Camera size={14} />} {...toggleProps}>相机型号</FieldLabel>
            <input aria-label="相机型号" type="text" value={data.exif.camera || ''} onChange={(event) => onChange('exif.camera', event.target.value)} disabled={disabled} placeholder="例如: Canon EOS 5D Mark IV" className={inputClass} />
          </div>

          <div>
            <FieldLabel field="exif.lens" label="镜头" icon={<Camera size={14} />} {...toggleProps}>镜头</FieldLabel>
            <input aria-label="镜头" type="text" value={data.exif.lens || ''} onChange={(event) => onChange('exif.lens', event.target.value)} disabled={disabled} placeholder="例如: EF 24-70mm f/2.8L" className={inputClass} />
          </div>

          <div>
            <FieldLabel field="exif.aperture" label="光圈" icon={<Aperture size={14} />} {...toggleProps}>光圈</FieldLabel>
            <input aria-label="光圈" type="text" value={data.exif.aperture || ''} onChange={(event) => onChange('exif.aperture', event.target.value)} disabled={disabled} placeholder="例如: f/2.8" className={inputClass} />
          </div>

          <div>
            <FieldLabel field="exif.shutterSpeed" label="快门速度" icon={<Gauge size={14} />} {...toggleProps}>快门速度</FieldLabel>
            <input aria-label="快门速度" type="text" value={data.exif.shutterSpeed || ''} onChange={(event) => onChange('exif.shutterSpeed', event.target.value)} disabled={disabled} placeholder="例如: 1/125s" className={inputClass} />
          </div>

          <div>
            <FieldLabel field="exif.iso" label="ISO" icon={<Film size={14} />} {...toggleProps}>ISO</FieldLabel>
            <input aria-label="ISO" type="text" value={data.exif.iso || ''} onChange={(event) => onChange('exif.iso', event.target.value)} disabled={disabled} placeholder="例如: ISO 400" className={inputClass} />
          </div>

          <div className={`${compact ? '' : 'md:col-span-2'} border-t border-gray-200 pt-4 mt-2`}>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><User size={16} />作者信息</h4>
          </div>

          <div>
            <FieldLabel field="exif.author" label="作者" icon={<User size={14} />} {...toggleProps}>作者</FieldLabel>
            <input aria-label="作者" type="text" value={data.exif.author || ''} onChange={(event) => onChange('exif.author', event.target.value)} disabled={disabled} placeholder="例如: 张三" className={inputClass} />
          </div>

          <div>
            <FieldLabel field="exif.copyright" label="版权" icon={<Copyright size={14} />} {...toggleProps}>版权</FieldLabel>
            <input aria-label="版权" type="text" value={data.exif.copyright || ''} onChange={(event) => onChange('exif.copyright', event.target.value)} disabled={disabled} placeholder="例如: © 2024 版权所有" className={inputClass} />
          </div>

          <div className={`${compact ? '' : 'md:col-span-2'} border-t border-gray-200 pt-4 mt-2`}>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><MapPin size={16} />地理位置</h4>
          </div>

          <div>
            <FieldLabel field="exif.country" label="国家" icon={<MapPin size={14} />} {...toggleProps}>国家</FieldLabel>
            <input aria-label="国家" type="text" value={data.exif.country || ''} onChange={(event) => onChange('exif.country', event.target.value)} disabled={disabled} placeholder="例如: 中国" className={inputClass} />
          </div>

          <div>
            <FieldLabel field="exif.province" label="省份" icon={<MapPin size={14} />} {...toggleProps}>省份</FieldLabel>
            <input aria-label="省份" type="text" value={data.exif.province || ''} onChange={(event) => onChange('exif.province', event.target.value)} disabled={disabled} placeholder="例如: 北京市" className={inputClass} />
          </div>

          <div>
            <FieldLabel field="exif.city" label="城市" icon={<MapPin size={14} />} {...toggleProps}>城市</FieldLabel>
            <input aria-label="城市" type="text" value={data.exif.city || ''} onChange={(event) => onChange('exif.city', event.target.value)} disabled={disabled} placeholder="例如: 北京" className={inputClass} />
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { X, Upload, Edit, Calendar, Camera, Aperture, Gauge, Film, User, Copyright, MapPin } from 'lucide-react';
import { TagSelector } from './TagSelector';
import { Photo } from '../types';
import exifr from 'exifr';

interface ExifData {
  camera?: string;
  lens?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: string;
  make?: string;
  model?: string;
  fNumber?: number;
  exposureTime?: number;
  isoSpeedRatings?: number;
  lensModel?: string;
  author?: string;
  copyright?: string;
  city?: string;
  province?: string;
  country?: string;
}

interface PhotoModalProps {
  isOpen: boolean;
  mode: 'upload' | 'edit';
  photo?: Photo | null; // 编辑模式时需要
  onClose: () => void;
  onUpload?: (data: {
    file: File;
    title: string;
    year: number;
    tags: string;
    exif: ExifData;
  }) => Promise<void>;
  onUpdate?: (id: string, data: {
    title: string;
    year: number;
    tags: string;
    exif: ExifData;
  }) => Promise<void>;
}

export const PhotoModal: React.FC<PhotoModalProps> = ({
  isOpen,
  mode,
  photo,
  onClose,
  onUpload,
  onUpdate,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [exifData, setExifData] = useState<ExifData>({});
  const [loadingExif, setLoadingExif] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUploadMode = mode === 'upload';
  const isEditMode = mode === 'edit';

  // 编辑模式：从照片数据初始化表单
  useEffect(() => {
    if (isEditMode && photo) {
      setTitle(photo.title);
      setYear(photo.year);
      setTags(photo.tags.join(', '));
      setPreviewUrl(photo.thumbnailUrl);
      setExifData({
        camera: photo.exif?.camera || '',
        lens: photo.exif?.lens || '',
        aperture: photo.exif?.aperture || '',
        shutterSpeed: photo.exif?.shutterSpeed || '',
        iso: photo.exif?.iso || '',
        author: photo.exif?.author || '',
        copyright: photo.exif?.copyright || '',
        city: photo.exif?.city || '',
        province: photo.exif?.province || '',
        country: photo.exif?.country || '',
      });
      setError(null);
    }
  }, [isEditMode, photo]);

  // 上传模式：当文件选择时，解析 EXIF 数据
  useEffect(() => {
    if (isUploadMode && selectedFile) {
      parseExifData(selectedFile);
      // 生成预览
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      // 自动填充标题
      if (!title) {
        setTitle(selectedFile.name.split('.')[0]);
      }
      return () => URL.revokeObjectURL(url);
    } else if (isUploadMode && !selectedFile) {
      setPreviewUrl(null);
      setExifData({});
    }
  }, [isUploadMode, selectedFile, title]);

  // 解析 EXIF 数据
  const parseExifData = async (file: File) => {
    setLoadingExif(true);
    try {
      const exif = await exifr.parse(file, {
        // 提取需要的字段
        pick: [
          'Make',
          'Model',
          'LensModel',
          'FNumber',
          'ExposureTime',
          'ISO',
          'DateTimeOriginal',
          'Artist',
          'Author',
          'Copyright',
          'City',
          'State',
          'Province',
          'Country',
        ],
      });

      if (exif) {
        // 格式化 EXIF 数据
        const formatted: ExifData = {
          make: exif.Make || '',
          model: exif.Model || '',
          camera: exif.Make && exif.Model 
            ? `${exif.Make} ${exif.Model}`.trim()
            : exif.Make || exif.Model || '',
          lens: exif.LensModel || '',
          aperture: exif.FNumber 
            ? `f/${exif.FNumber.toFixed(1)}`
            : '',
          shutterSpeed: exif.ExposureTime
            ? exif.ExposureTime >= 1
              ? `${exif.ExposureTime.toFixed(0)}s`
              : `1/${Math.round(1 / exif.ExposureTime)}s`
            : '',
          iso: exif.ISO ? `ISO ${exif.ISO}` : '',
          fNumber: exif.FNumber,
          exposureTime: exif.ExposureTime,
          isoSpeedRatings: exif.ISO,
          lensModel: exif.LensModel,
          author: exif.Author || exif.Artist || '',
          copyright: exif.Copyright || '',
          city: exif.City || '',
          province: exif.State || exif.Province || '',
          country: exif.Country || '',
        };

        // 如果从 EXIF 中获取到拍摄日期，自动设置年份
        if (exif.DateTimeOriginal) {
          const date = new Date(exif.DateTimeOriginal);
          if (!isNaN(date.getTime())) {
            setYear(date.getFullYear());
          }
        }

        setExifData(formatted);
      } else {
        setExifData({});
      }
    } catch (error) {
      console.error('解析 EXIF 数据失败:', error);
      setExifData({});
    } finally {
      setLoadingExif(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isUploadMode && !selectedFile) return;
    if (isEditMode && !photo) return;

    setSaving(true);
    setError(null);
    try {
      if (isUploadMode && onUpload) {
        await onUpload({
          file: selectedFile!,
          title,
          year,
          tags,
          exif: exifData,
        });
      } else if (isEditMode && onUpdate && photo) {
        await onUpdate(photo.id, {
          title,
          year,
          tags,
          exif: exifData,
        });
      }

      // 重置表单并关闭
      handleClose();
    } catch (error) {
      console.error('保存失败:', error);
      setError(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setTitle('');
    setYear(new Date().getFullYear());
    setTags('');
    setExifData({});
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            {isUploadMode ? (
              <>
                <Upload size={20} />
                上传照片
              </>
            ) : (
              <>
                <Edit size={20} />
                编辑照片
              </>
            )}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-lg"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain photo-modal-scroll">
          <style>{`
            .photo-modal-scroll {
              scrollbar-width: thin;
              scrollbar-color: #d1d5db transparent;
            }
            .photo-modal-scroll::-webkit-scrollbar {
              width: 6px;
            }
            .photo-modal-scroll::-webkit-scrollbar-track {
              background: transparent;
              margin: 8px 0;
            }
            .photo-modal-scroll::-webkit-scrollbar-thumb {
              background: #d1d5db;
              border-radius: 3px;
              transition: background 0.2s;
            }
            .photo-modal-scroll::-webkit-scrollbar-thumb:hover {
              background: #9ca3af;
            }
          `}</style>
          <form id="photo-form" onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 文件选择和预览 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 文件选择（上传模式）或照片预览（编辑模式） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isUploadMode ? '选择照片' : '照片预览'}
              </label>
              {isUploadMode ? (
                <>
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      required={isUploadMode}
                    />
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="预览"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="flex flex-col items-center">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-full mb-2">
                          <Upload size={24} />
                        </div>
                        <span className="text-sm text-gray-500">点击或拖放选择照片</span>
                      </div>
                    )}
                  </div>
                  {selectedFile && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      {selectedFile.name}
                    </p>
                  )}
                </>
              ) : (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt={title}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  )}
                </div>
              )}
            </div>

            {/* 基本信息 */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  标题
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  年份
                </label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <TagSelector
                value={tags}
                onChange={setTags}
                placeholder="输入标签或从列表选择..."
              />
            </div>
          </div>

          {/* EXIF 信息 */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Camera size={18} />
              EXIF 信息
            </h3>
            
            {isUploadMode && loadingExif ? (
              <div className="text-sm text-gray-500 py-4">正在解析 EXIF 数据...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Camera size={14} />
                    相机型号
                  </label>
                  <input
                    type="text"
                    value={exifData.camera || ''}
                    onChange={(e) => setExifData({ ...exifData, camera: e.target.value })}
                    placeholder="例如: Canon EOS 5D Mark IV"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Camera size={14} />
                    镜头
                  </label>
                  <input
                    type="text"
                    value={exifData.lens || ''}
                    onChange={(e) => setExifData({ ...exifData, lens: e.target.value })}
                    placeholder="例如: EF 24-70mm f/2.8L"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Aperture size={14} />
                    光圈
                  </label>
                  <input
                    type="text"
                    value={exifData.aperture || ''}
                    onChange={(e) => setExifData({ ...exifData, aperture: e.target.value })}
                    placeholder="例如: f/2.8"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Gauge size={14} />
                    快门速度
                  </label>
                  <input
                    type="text"
                    value={exifData.shutterSpeed || ''}
                    onChange={(e) => setExifData({ ...exifData, shutterSpeed: e.target.value })}
                    placeholder="例如: 1/125s"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Film size={14} />
                    ISO
                  </label>
                  <input
                    type="text"
                    value={exifData.iso || ''}
                    onChange={(e) => setExifData({ ...exifData, iso: e.target.value })}
                    placeholder="例如: ISO 400"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* 作者信息 */}
                <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <User size={16} />
                    作者信息
                  </h4>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <User size={14} />
                    作者
                  </label>
                  <input
                    type="text"
                    value={exifData.author || ''}
                    onChange={(e) => setExifData({ ...exifData, author: e.target.value })}
                    placeholder="例如: 张三"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Copyright size={14} />
                    版权
                  </label>
                  <input
                    type="text"
                    value={exifData.copyright || ''}
                    onChange={(e) => setExifData({ ...exifData, copyright: e.target.value })}
                    placeholder="例如: © 2024 版权所有"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* 地理位置信息 */}
                <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <MapPin size={16} />
                    地理位置
                  </h4>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <MapPin size={14} />
                    国家
                  </label>
                  <input
                    type="text"
                    value={exifData.country || ''}
                    onChange={(e) => setExifData({ ...exifData, country: e.target.value })}
                    placeholder="例如: 中国"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <MapPin size={14} />
                    省份
                  </label>
                  <input
                    type="text"
                    value={exifData.province || ''}
                    onChange={(e) => setExifData({ ...exifData, province: e.target.value })}
                    placeholder="例如: 北京市"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <MapPin size={14} />
                    城市
                  </label>
                  <input
                    type="text"
                    value={exifData.city || ''}
                    onChange={(e) => setExifData({ ...exifData, city: e.target.value })}
                    placeholder="例如: 北京"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

            {/* 错误提示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg animate-in slide-in-from-top-2 duration-200">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
            disabled={saving}
          >
            取消
          </button>
          <button
            type="submit"
            form="photo-form"
            disabled={saving || (isUploadMode && !selectedFile)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-white font-medium transition-all ${
              saving || (isUploadMode && !selectedFile)
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30'
            }`}
          >
            {saving 
              ? (isUploadMode ? '上传中...' : '保存中...') 
              : (isUploadMode ? '发布照片' : '保存更改')
            }
          </button>
        </div>
      </div>
    </div>
  );
};


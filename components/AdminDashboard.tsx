import React, { useState, useEffect } from 'react';
import { Photo } from '../types';
import { Upload, Trash2, Lock, Plus, Edit, Search, Filter, List, Grid, X, Settings, FileText, Image, Download, RefreshCw, Trash, Eye, Calendar, Clock, Heart } from 'lucide-react';
import { photoService } from '../services/photoService';
import { tagService } from '../services/tagService';
import { getStorageMode, getSTSCredentials, uploadToOSSAuto, generateFilePath } from '../services/ossService';
import { settingsService, StorageSettings, GallerySettings } from '../services/settingsService';
import { logService, LogEntry } from '../services/logService';
import { API_BASE_URL } from '../services/config';
import { PhotoModal } from './PhotoModal';

interface AdminDashboardProps {
  photos: Photo[];
  onAddPhoto: (photo: Photo) => void;
  onDeletePhoto: (id: string) => void;
  onUpdatePhoto?: (photo: Photo) => void;
}

type ViewMode = 'list' | 'grid';
type TabType = 'photos' | 'settings' | 'logs';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ photos, onAddPhoto, onDeletePhoto, onUpdatePhoto }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('photos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'upload' | 'edit'>('upload');
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  
  // 搜索和筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  
  // 筛选选项
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>(photos);

  // 加载筛选选项
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [years, tags] = await Promise.all([
          tagService.getAvailableYears(),
          tagService.getAllTagNames()
        ]);
        setAvailableYears(years);
        setAvailableTags(tags);
      } catch (error) {
        console.error('加载筛选选项失败:', error);
      }
    };
    
    if (isAuthenticated) {
      loadFilterOptions();
    }
  }, [isAuthenticated, photos]);

  // 应用搜索和筛选
  useEffect(() => {
    const applyFilters = async () => {
      try {
        const options: { year?: number; tags?: string[]; search?: string } = {};
        if (selectedYear) options.year = selectedYear;
        if (selectedTags.length > 0) options.tags = selectedTags;
        if (searchQuery.trim()) options.search = searchQuery.trim();

        const filtered = await photoService.getPhotos(options);
        setFilteredPhotos(filtered);
      } catch (error) {
        console.error('应用筛选失败:', error);
        setFilteredPhotos(photos);
      }
    };

    applyFilters();
  }, [searchQuery, selectedYear, selectedTags, photos]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 从数据库验证密码
      const response = await fetch(`${API_BASE_URL}/settings/admin`);
      if (response.ok) {
        const result = await response.json();
        // 临时验证：先使用默认密码或从数据库获取
        // 这里简化处理，实际应该调用验证接口
        if (password === 'admin123') {
          setIsAuthenticated(true);
        } else {
          alert('密码错误');
        }
      } else {
        // 如果接口失败，使用默认密码
        if (password === 'admin123') {
          setIsAuthenticated(true);
        } else {
          alert('密码错误。请尝试 "admin123"');
        }
      }
    } catch (error) {
      // 如果接口失败，使用默认密码
      if (password === 'admin123') {
        setIsAuthenticated(true);
      } else {
        alert('密码错误。请尝试 "admin123"');
      }
    }
  };

  /**
   * 获取图片尺寸
   */
  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      // 使用 document.createElement 创建 img 元素，兼容性更好
      const img = document.createElement('img');
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('无法读取图片尺寸'));
      };
      
      img.src = objectUrl;
    });
  };

  const handleUpload = async (data: {
    file: File;
    title: string;
    year: number;
    tags: string;
    exif: {
      camera?: string;
      lens?: string;
      aperture?: string;
      shutterSpeed?: string;
      iso?: string;
      author?: string;
      copyright?: string;
      city?: string;
      province?: string;
      country?: string;
    };
  }) => {
    try {
      // 获取图片尺寸
      const { width, height } = await getImageDimensions(data.file);
      
      // 解析标签
      const tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);

      // 获取存储模式
      const storageMode = await getStorageMode();
      let imageUrl: string;
      let thumbnailUrl: string;

      if (storageMode === 'oss') {
        // OSS 模式：前端直传（失败时自动回退到后端代理）
        // 1. 获取 STS 临时凭证
        const credentials = await getSTSCredentials();
        
        // 2. 生成文件路径
        const filePath = generateFilePath(data.file.name, 'photos');
        const thumbPath = generateFilePath(data.file.name, 'thumbs');
        
        // 3. 上传原图到 OSS（自动处理 CORS 问题）
        imageUrl = await uploadToOSSAuto(data.file, filePath, credentials);
        
        // 4. 生成缩略图（简化版本：使用原图，后续可以优化）
        thumbnailUrl = imageUrl;
        
        // TODO: 生成缩略图并上传
        // const thumbnailFile = await generateThumbnail(data.file);
        // thumbnailUrl = await uploadToOSSAuto(thumbnailFile, thumbPath, credentials);
      } else {
        // 本地模式：上传到后端
        const formData = new FormData();
        formData.append('file', data.file);
        
        const uploadResponse = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          throw new Error('文件上传失败');
        }
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
          throw new Error(uploadResult.error || '文件上传失败');
        }
        
        imageUrl = uploadResult.data.url;
        thumbnailUrl = imageUrl; // 本地模式暂时使用原图
      }

      // 5. 保存元数据到数据库
      const newPhoto = await photoService.uploadPhoto(
        imageUrl,
        thumbnailUrl,
        {
          title: data.title,
          tags: tags,
          year: Number(data.year),
          width: width,
          height: height,
          exif: {
            camera: data.exif.camera || '',
            lens: data.exif.lens || '',
            aperture: data.exif.aperture || '',
            shutterSpeed: data.exif.shutterSpeed || '',
            iso: data.exif.iso || '',
            author: data.exif.author || '',
            copyright: data.exif.copyright || '',
            city: data.exif.city || '',
            province: data.exif.province || '',
            country: data.exif.country || ''
          }
        }
      );

      // 通知父组件照片已添加（会触发重新加载列表）
      onAddPhoto(newPhoto);
    } catch (error) {
      console.error('上传照片失败:', error);
      throw error;
    }
  };

  const handleUpdate = async (id: string, data: {
    title: string;
    year: number;
    tags: string;
    exif: {
      camera?: string;
      lens?: string;
      aperture?: string;
      shutterSpeed?: string;
      iso?: string;
      author?: string;
      copyright?: string;
      city?: string;
      province?: string;
      country?: string;
    };
  }) => {
    // 解析标签
    const tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);

    // 更新照片
    const updatedPhoto = await photoService.updatePhoto(id, {
      title: data.title,
      year: data.year,
      tags: tags,
      exif: {
        camera: data.exif.camera || '',
        lens: data.exif.lens || '',
        aperture: data.exif.aperture || '',
        shutterSpeed: data.exif.shutterSpeed || '',
        iso: data.exif.iso || '',
        author: data.exif.author || '',
        copyright: data.exif.copyright || '',
        city: data.exif.city || '',
        province: data.exif.province || '',
        country: data.exif.country || ''
      }
    });

    // 通知父组件照片已更新
    if (onUpdatePhoto) {
      onUpdatePhoto(updatedPhoto);
    }
  };

  const handleEditClick = (photo: Photo) => {
    setEditingPhoto(photo);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // 获取位置信息
  const getLocationString = (photo: Photo): string => {
    if (!photo.exif) return '';
    const { city, province, country } = photo.exif;
    const parts = [city, province, country].filter(Boolean);
    return parts.join(', ') || '';
  };

  // 获取EXIF信息摘要
  const getExifSummary = (photo: Photo): string => {
    if (!photo.exif) return '';
    const parts: string[] = [];
    if (photo.exif.camera) parts.push(`相机: ${photo.exif.camera}`);
    if (photo.exif.lens) parts.push(`镜头: ${photo.exif.lens}`);
    if (photo.exif.aperture) {
      // 避免重复的 f/ 前缀
      const apertureValue = photo.exif.aperture.toString();
      parts.push(apertureValue.toLowerCase().startsWith('f/') ? apertureValue : `f/${apertureValue}`);
    }
    if (photo.exif.shutterSpeed) {
      // 避免重复的 s 后缀
      const shutterValue = photo.exif.shutterSpeed.toString();
      parts.push(shutterValue.toLowerCase().endsWith('s') ? shutterValue : `${shutterValue}s`);
    }
    if (photo.exif.iso) {
      // 避免重复的 ISO 前缀
      const isoValue = photo.exif.iso.toString();
      parts.push(isoValue.toUpperCase().startsWith('ISO') ? isoValue : `ISO ${isoValue}`);
    }
    return parts.join(' • ');
  };

  // 切换标签选择
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  // 清除所有筛选
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedYear(null);
    setSelectedTags([]);
  };

  const hasActiveFilters = searchQuery.trim() || selectedYear !== null || selectedTags.length > 0;

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
          <div className="flex flex-col items-center mb-6 text-gray-800">
            <div className="p-3 bg-blue-50 rounded-full mb-3 text-blue-600">
              <Lock size={24} />
            </div>
            <h2 className="text-2xl font-bold">管理员访问</h2>
            <p className="text-gray-500 text-sm">请验证您的身份</p>
          </div>
          
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入密码 (admin123)"
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all mb-4"
            autoFocus
          />
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-lg shadow-blue-600/20"
          >
            访问仪表板
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">仪表板</h1>
          <p className="text-gray-500 mt-1">管理您的图库内容</p>
        </div>
        <button 
          onClick={() => setIsAuthenticated(false)}
          className="text-sm text-red-600 hover:text-red-700 font-medium"
        >
          退出登录
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('photos')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'photos'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Image size={18} />
            照片管理
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Settings size={18} />
            设置
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'logs'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText size={18} />
            日志
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'photos' && (
        <>
          {/* Search and Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
        {/* Search Bar */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索照片（标题、标签、位置...）"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            />
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="列表视图"
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="网格视图"
            >
              <Grid size={18} />
            </button>
          </div>

          {/* Upload Button */}
          <button
            onClick={() => {
              setModalMode('upload');
              setEditingPhoto(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-600/20 whitespace-nowrap"
          >
            <Plus size={18} />
            上传照片
          </button>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">筛选:</span>
            </div>
            
            {/* Year Filter */}
            <select
              value={selectedYear || ''}
              onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
            >
              <option value="">全部年份</option>
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={16} />
                清除筛选
              </button>
            )}
          </div>

          {/* Tag Filters - Multi-select checkboxes */}
          {availableTags.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-sm text-gray-600 font-medium pt-2 whitespace-nowrap">标签筛选:</span>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                  <label
                    key={tag}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm">{tag}</span>
                    {selectedTags.includes(tag) && (
                      <span className="text-xs bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center">
                        {selectedTags.indexOf(tag) + 1}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Photo List/Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            图库 ({filteredPhotos.length})
            {hasActiveFilters && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                (已筛选，共 {photos.length} 张)
              </span>
            )}
          </h2>
        </div>

        {filteredPhotos.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <p className="text-gray-500">没有找到照片</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                清除筛选条件
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* List View */
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {filteredPhotos.map(photo => (
              <div key={photo.id} className="flex items-center gap-4 p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="relative w-20 h-20 flex-shrink-0">
                  <img src={photo.thumbnailUrl} alt={photo.title} className="w-full h-full object-cover rounded-md" />
                  <div className="absolute bottom-1 right-1 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-white text-xs">
                    <div className="flex items-center gap-1">
                      <Heart size={12} className="text-red-400" />
                      <span>{photo.likesCount || 0}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye size={12} className="text-blue-400" />
                      <span>{photo.viewsCount || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">{photo.title}</h3>
                  <div className="flex flex-wrap gap-2 text-sm text-gray-500 mt-1">
                    <span>{photo.year}</span>
                    {photo.tags.length > 0 && (
                      <>
                        <span>•</span>
                        <span className="truncate">{photo.tags.join(', ')}</span>
                      </>
                    )}
                    {getLocationString(photo) && (
                      <>
                        <span>•</span>
                        <span className="text-blue-600">📍 {getLocationString(photo)}</span>
                      </>
                    )}
                  </div>
                  {getExifSummary(photo) && (
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      {getExifSummary(photo)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button 
                    onClick={() => handleEditClick(photo)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="编辑"
                  >
                    <Edit size={18} />
                  </button>
                  <button 
                    onClick={() => onDeletePhoto(photo.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPhotos.map(photo => (
              <div key={photo.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative aspect-square">
                  <img 
                    src={photo.thumbnailUrl} 
                    alt={photo.title} 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                      <h3 className="font-medium text-sm truncate">{photo.title}</h3>
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-white text-xs">
                    <div className="flex items-center gap-1">
                      <Heart size={12} className="text-red-400" />
                      <span>{photo.likesCount || 0}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye size={12} className="text-blue-400" />
                      <span>{photo.viewsCount || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate flex-1" title={photo.title}>{photo.title}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button 
                        onClick={() => handleEditClick(photo)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        onClick={() => onDeletePhoto(photo.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-xs table-fixed">
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="py-1 pr-2 text-gray-500 font-medium w-10 whitespace-nowrap">年份</td>
                        <td className="py-1 text-gray-900 truncate">{photo.year}</td>
                      </tr>
                      {photo.tags.length > 0 && (
                        <tr>
                          <td className="py-1 pr-2 text-gray-500 font-medium whitespace-nowrap">标签</td>
                          <td className="py-1 text-gray-900 truncate" title={photo.tags.join(', ')}>{photo.tags.join(', ')}</td>
                        </tr>
                      )}
                      {getLocationString(photo) && (
                        <tr>
                          <td className="py-1 pr-2 text-gray-500 font-medium whitespace-nowrap">位置</td>
                          <td className="py-1 text-blue-600 truncate" title={getLocationString(photo)}>{getLocationString(photo)}</td>
                        </tr>
                      )}
                      {photo.exif?.camera && (
                        <tr>
                          <td className="py-1 pr-2 text-gray-500 font-medium whitespace-nowrap">相机</td>
                          <td className="py-1 text-gray-900 truncate" title={photo.exif.camera}>{photo.exif.camera}</td>
                        </tr>
                      )}
                      {photo.exif?.lens && (
                        <tr>
                          <td className="py-1 pr-2 text-gray-500 font-medium whitespace-nowrap">镜头</td>
                          <td className="py-1 text-gray-900 truncate" title={photo.exif.lens}>{photo.exif.lens}</td>
                        </tr>
                      )}
                      {(photo.exif?.aperture || photo.exif?.shutterSpeed || photo.exif?.iso) && (
                        <tr>
                          <td className="py-1 pr-2 text-gray-500 font-medium whitespace-nowrap">参数</td>
                          <td className="py-1 text-gray-900 truncate" title={[
                              photo.exif.aperture && (photo.exif.aperture.toString().toLowerCase().startsWith('f/') ? photo.exif.aperture : `f/${photo.exif.aperture}`),
                              photo.exif.shutterSpeed && (photo.exif.shutterSpeed.toString().toLowerCase().endsWith('s') ? photo.exif.shutterSpeed : `${photo.exif.shutterSpeed}s`),
                              photo.exif.iso && (photo.exif.iso.toString().toUpperCase().startsWith('ISO') ? photo.exif.iso : `ISO ${photo.exif.iso}`)
                            ].filter(Boolean).join(' • ')}>
                            {[
                              photo.exif.aperture && (photo.exif.aperture.toString().toLowerCase().startsWith('f/') ? photo.exif.aperture : `f/${photo.exif.aperture}`),
                              photo.exif.shutterSpeed && (photo.exif.shutterSpeed.toString().toLowerCase().endsWith('s') ? photo.exif.shutterSpeed : `${photo.exif.shutterSpeed}s`),
                              photo.exif.iso && (photo.exif.iso.toString().toUpperCase().startsWith('ISO') ? photo.exif.iso : `ISO ${photo.exif.iso}`)
                            ].filter(Boolean).join(' • ')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

          {/* Photo Modal (Upload/Edit) */}
          <PhotoModal
            isOpen={isModalOpen}
            mode={modalMode}
            photo={editingPhoto}
            onClose={() => {
              setIsModalOpen(false);
              setEditingPhoto(null);
            }}
            onUpload={handleUpload}
            onUpdate={handleUpdate}
          />
        </>
      )}

      {activeTab === 'settings' && (
        <SettingsTab />
      )}

      {activeTab === 'logs' && (
        <LogsTab />
      )}
    </div>
  );
};

// 设置标签页组件
const SettingsTab: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  
  const [storageSettings, setStorageSettings] = useState<StorageSettings | null>(null);
  const [gallerySettings, setGallerySettings] = useState<GallerySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingGallery, setSavingGallery] = useState(false);

  useEffect(() => {
    loadStorageSettings();
    loadGallerySettings();
  }, []);

  const loadStorageSettings = async () => {
    try {
      setLoading(true);
      const settings = await settingsService.getStorageSettings();
      // 确保所有字段都有默认值
      setStorageSettings({
        ...settings,
        local: settings.local || {
          uploadDir: './uploads',
          publicUrl: 'http://localhost:3001/uploads'
        },
        oss: settings.oss || {
          provider: 'aliyun',
          region: '',
          accessKeyId: '',
          accessKeySecret: '',
          bucket: '',
          endpoint: '',
          roleArn: '',
          roleSessionName: 'fluent-gallery-session'
        },
        server: settings.server || {
          port: '3001'
        },
        frontend: settings.frontend || {
          apiBaseUrl: 'http://localhost:3001/api'
        }
      });
    } catch (error: any) {
      console.error('加载存储设置失败:', error);
      alert('加载存储设置失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGallerySettings = async () => {
    try {
      const settings = await settingsService.getGallerySettings();
      setGallerySettings(settings);
    } catch (error: any) {
      console.error('加载图库设置失败:', error);
      // 如果加载失败，使用默认值
      setGallerySettings({ randomizePhotos: false });
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!newPassword || newPassword.length < 6) {
      setPasswordError('新密码长度至少为6位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    try {
      await settingsService.updatePassword(currentPassword, newPassword);
      setPasswordSuccess('密码更新成功');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setPasswordError(error.message || '更新密码失败');
    }
  };

  const handleStorageSave = async () => {
    if (!storageSettings) return;
    
    try {
      setSaving(true);
      
      // 准备保存的配置，只保存当前模式相关的配置
      const configToSave: StorageSettings = {
        mode: storageSettings.mode,
        server: storageSettings.server,
        frontend: storageSettings.frontend
      };
      
      if (storageSettings.mode === 'local' && storageSettings.local) {
        configToSave.local = storageSettings.local;
      } else if (storageSettings.mode === 'oss' && storageSettings.oss) {
        configToSave.oss = storageSettings.oss;
      }
      
      await settingsService.updateStorageSettings(configToSave);
      alert('配置已保存到数据库（需要重启服务器生效）');
    } catch (error: any) {
      alert('保存存储设置失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGallerySave = async () => {
    if (!gallerySettings) return;
    
    try {
      setSavingGallery(true);
      await settingsService.updateGallerySettings(gallerySettings);
      alert('图库设置已保存');
    } catch (error: any) {
      alert('保存图库设置失败: ' + error.message);
    } finally {
      setSavingGallery(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* 管理员密码设置 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">管理员密码</h2>
        <form onSubmit={handlePasswordUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">当前密码</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              required
              minLength={6}
            />
          </div>
          {passwordError && (
            <div className="text-red-600 text-sm">{passwordError}</div>
          )}
          {passwordSuccess && (
            <div className="text-green-600 text-sm">{passwordSuccess}</div>
          )}
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            更新密码
          </button>
        </form>
      </div>

      {/* 存储设置 */}
      {storageSettings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:col-span-2 lg:col-span-2">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">存储设置</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">存储模式</label>
              <select
                value={storageSettings.mode}
                onChange={(e) => {
                  const newMode = e.target.value as 'local' | 'oss';
                  if (newMode === 'oss' && !storageSettings.oss) {
                    // 切换到OSS模式时，如果没有OSS配置，初始化一个
                    setStorageSettings({
                      ...storageSettings,
                      mode: newMode,
                      oss: {
                        provider: 'aliyun',
                        region: '',
                        accessKeyId: '',
                        accessKeySecret: '',
                        bucket: '',
                        endpoint: '',
                        roleArn: '',
                        roleSessionName: 'fluent-gallery-session'
                      }
                    });
                  } else if (newMode === 'local' && !storageSettings.local) {
                    // 切换到本地模式时，如果没有本地配置，初始化一个
                    setStorageSettings({
                      ...storageSettings,
                      mode: newMode,
                      local: {
                        uploadDir: './uploads',
                        publicUrl: 'http://localhost:3001/uploads'
                      }
                    });
                  } else {
                    setStorageSettings({ ...storageSettings, mode: newMode });
                  }
                }}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              >
                <option value="local">本地存储</option>
                <option value="oss">OSS存储</option>
              </select>
            </div>

            {storageSettings.mode === 'local' && storageSettings.local && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">上传目录</label>
                  <input
                    type="text"
                    value={storageSettings.local.uploadDir}
                    onChange={(e) => setStorageSettings({
                      ...storageSettings,
                      local: { ...storageSettings.local!, uploadDir: e.target.value }
                    })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">公共URL</label>
                  <input
                    type="text"
                    value={storageSettings.local.publicUrl}
                    onChange={(e) => setStorageSettings({
                      ...storageSettings,
                      local: { ...storageSettings.local!, publicUrl: e.target.value }
                    })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
              </div>
            )}

            {storageSettings.mode === 'oss' && storageSettings.oss && (
              <div className="space-y-4">
                {/* OSS 提供商选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    OSS 提供商 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={storageSettings.oss.provider || 'aliyun'}
                    onChange={(e) => {
                      const newProvider = e.target.value as 'aliyun' | 'tencent';
                      setStorageSettings({
                        ...storageSettings,
                        oss: { 
                          ...storageSettings.oss!, 
                          provider: newProvider,
                          // 切换提供商时，清空一些字段，避免混淆
                          endpoint: newProvider === 'tencent' ? '' : storageSettings.oss!.endpoint
                        }
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  >
                    <option value="aliyun">阿里云 OSS</option>
                    <option value="tencent">腾讯云 COS</option>
                  </select>
                </div>

                {/* 区域配置 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {storageSettings.oss.provider === 'tencent' ? '地域' : '区域'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={storageSettings.oss.region || ''}
                    onChange={(e) => setStorageSettings({
                      ...storageSettings,
                      oss: { ...storageSettings.oss!, region: e.target.value }
                    })}
                    placeholder={storageSettings.oss.provider === 'tencent' ? 'ap-guangzhou' : 'oss-cn-hangzhou'}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {storageSettings.oss.provider === 'tencent' 
                      ? '例如: ap-guangzhou (广州), ap-shanghai (上海), ap-beijing (北京)' 
                      : '例如: oss-cn-hangzhou, oss-cn-beijing'}
                  </p>
                </div>

                {/* AccessKeyId / SecretId */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {storageSettings.oss.provider === 'tencent' ? 'SecretId' : 'AccessKeyId'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={storageSettings.oss.accessKeyId || ''}
                    onChange={(e) => setStorageSettings({
                      ...storageSettings,
                      oss: { ...storageSettings.oss!, accessKeyId: e.target.value }
                    })}
                    placeholder={storageSettings.oss.provider === 'tencent' ? 'your_secret_id' : 'your_access_key_id'}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>

                {/* AccessKeySecret / SecretKey */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {storageSettings.oss.provider === 'tencent' ? 'SecretKey' : 'AccessKeySecret'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={storageSettings.oss.accessKeySecret || ''}
                    onChange={(e) => setStorageSettings({
                      ...storageSettings,
                      oss: { ...storageSettings.oss!, accessKeySecret: e.target.value }
                    })}
                    placeholder={storageSettings.oss.provider === 'tencent' ? 'your_secret_key' : 'your_access_key_secret'}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bucket <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={storageSettings.oss.bucket || ''}
                    onChange={(e) => setStorageSettings({
                      ...storageSettings,
                      oss: { ...storageSettings.oss!, bucket: e.target.value }
                    })}
                    placeholder="your-bucket-name"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
                {/* Endpoint - 仅阿里云显示 */}
                {storageSettings.oss.provider === 'aliyun' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Endpoint</label>
                    <input
                      type="text"
                      value={storageSettings.oss.endpoint || ''}
                      onChange={(e) => setStorageSettings({
                        ...storageSettings,
                        oss: { ...storageSettings.oss!, endpoint: e.target.value }
                      })}
                      placeholder="https://oss-cn-hangzhou.aliyuncs.com"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">可选，留空使用默认endpoint</p>
                  </div>
                )}

                {/* STS Role ARN - 仅阿里云显示 */}
                {storageSettings.oss.provider === 'aliyun' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">STS Role ARN</label>
                    <input
                      type="text"
                      value={storageSettings.oss.roleArn || ''}
                      onChange={(e) => setStorageSettings({
                        ...storageSettings,
                        oss: { ...storageSettings.oss!, roleArn: e.target.value }
                      })}
                      placeholder="acs:ram::1234567890123456:role/oss-role"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">可选，用于STS临时凭证（生产环境推荐）</p>
                  </div>
                )}

                {/* STS Session Name - 仅阿里云显示 */}
                {storageSettings.oss.provider === 'aliyun' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">STS Session Name</label>
                    <input
                      type="text"
                      value={storageSettings.oss.roleSessionName || 'fluent-gallery-session'}
                      onChange={(e) => setStorageSettings({
                        ...storageSettings,
                        oss: { ...storageSettings.oss!, roleSessionName: e.target.value }
                      })}
                      placeholder="fluent-gallery-session"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">STS会话名称</p>
                  </div>
                )}

                {/* 腾讯云提示 */}
                {storageSettings.oss.provider === 'tencent' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <strong>提示：</strong>腾讯云 COS 使用后端代理上传，无需配置 CORS。上传的文件会自动上传到你的 COS Bucket。
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleStorageSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
            <p className="text-sm text-gray-500">注意：修改存储设置需要重启服务器才能生效</p>
          </div>
        </div>
      )}

      {/* 服务器设置 */}
      {storageSettings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">服务器设置</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">端口</label>
              <input
                type="text"
                value={storageSettings.server?.port || '3001'}
                onChange={(e) => setStorageSettings({
                  ...storageSettings,
                  server: { ...storageSettings.server, port: e.target.value }
                })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">服务器监听端口</p>
            </div>
            <button
              onClick={handleStorageSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
            <p className="text-sm text-gray-500">注意：修改服务器设置需要重启服务器才能生效</p>
          </div>
        </div>
      )}

      {/* 前端设置 */}
      {storageSettings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">前端设置</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API Base URL</label>
              <input
                type="text"
                value={storageSettings.frontend?.apiBaseUrl || 'http://localhost:3001/api'}
                onChange={(e) => setStorageSettings({
                  ...storageSettings,
                  frontend: { ...storageSettings.frontend, apiBaseUrl: e.target.value }
                })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">前端API基础URL（需要重新构建前端才能生效）</p>
            </div>
            <button
              onClick={handleStorageSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
            <p className="text-sm text-gray-500">注意：修改前端设置需要重新构建前端才能生效</p>
          </div>
        </div>
      )}

      {/* 图库设置 */}
      {gallerySettings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">图库设置</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  图片乱序加载
                </label>
                <p className="text-xs text-gray-500">
                  启用后，主页图片将随机排序显示（仅在无筛选条件时生效）
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={gallerySettings.randomizePhotos}
                  onChange={(e) => setGallerySettings({
                    ...gallerySettings,
                    randomizePhotos: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <button
              onClick={handleGallerySave}
              disabled={savingGallery}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {savingGallery ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// 日志标签页组件
const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFiles, setLogFiles] = useState<{ name: string; size: number; mtime: string; path: string }[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');

  // 加载日志文件列表
  useEffect(() => {
    loadLogFiles();
  }, []);

  // 加载日志
  useEffect(() => {
    loadLogs();
  }, [page, level, searchQuery, selectedFile, startDate, endDate]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadLogs();
      }, 5000); // 每5秒刷新一次
      setRefreshInterval(interval);
      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  }, [autoRefresh]);

  const loadLogFiles = async () => {
    try {
      const files = await logService.getLogFiles();
      setLogFiles(files);
      if (files.length > 0 && !selectedFile) {
        setSelectedFile(files[0].name);
      }
    } catch (error: any) {
      console.error('加载日志文件列表失败:', error);
    }
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      const result = await logService.getLogs({ 
        page, 
        limit, 
        level: level || undefined,
        search: searchQuery || undefined,
        file: selectedFile || undefined,
        startTime: startDate || undefined,
        endTime: endDate || undefined
      });
      setLogs(result.logs);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      if (result.file) {
        setCurrentFileName(result.file);
      }
    } catch (error: any) {
      console.error('加载日志失败:', error);
      alert('加载日志失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await logService.exportLogs({
        level: level || undefined,
        search: searchQuery || undefined,
        file: selectedFile || undefined,
        startTime: startDate || undefined,
        endTime: endDate || undefined
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert('导出日志失败: ' + error.message);
    }
  };

  const handleClear = async () => {
    if (!confirm(`确定要清空${selectedFile ? `日志文件 "${selectedFile}"` : '所有日志文件'}吗？此操作不可恢复！`)) {
      return;
    }

    try {
      await logService.clearLogs(selectedFile || undefined);
      alert('日志已清空');
      loadLogs();
      loadLogFiles();
    } catch (error: any) {
      alert('清空日志失败: ' + error.message);
    }
  };

  const getLevelColor = (level: string) => {
    if (level.includes('ERROR') || level.includes('❌')) return 'text-red-600 bg-red-50';
    if (level.includes('WARN') || level.includes('⚠️')) return 'text-yellow-600 bg-yellow-50';
    if (level.includes('INFO') || level.includes('✅')) return 'text-blue-600 bg-blue-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getLevelBadgeColor = (level: string) => {
    if (level.includes('ERROR') || level.includes('❌')) return 'bg-red-100 text-red-800 border-red-200';
    if (level.includes('WARN') || level.includes('⚠️')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (level.includes('INFO') || level.includes('✅')) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="space-y-4">
      {/* 筛选和操作栏 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 日志文件选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">日志文件</label>
            <select
              value={selectedFile}
              onChange={(e) => {
                setSelectedFile(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
            >
              <option value="">最新文件</option>
              {logFiles.map(file => (
                <option key={file.name} value={file.name}>
                  {file.name} ({formatFileSize(file.size)})
                </option>
              ))}
            </select>
          </div>

          {/* 日志级别筛选 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">日志级别</label>
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
            >
              <option value="">全部级别</option>
              <option value="ERROR">错误</option>
              <option value="WARN">警告</option>
              <option value="INFO">信息</option>
              <option value="DEBUG">调试</option>
            </select>
          </div>

          {/* 开始时间 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">开始时间</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
            />
          </div>

          {/* 结束时间 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">结束时间</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
            />
          </div>
        </div>

        {/* 搜索和操作按钮 */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="搜索日志内容..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span>自动刷新</span>
            </label>
          </div>

          <button
            onClick={loadLogs}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
          >
            <RefreshCw size={16} />
            刷新
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
          >
            <Download size={16} />
            导出
          </button>

          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
          >
            <Trash size={16} />
            清空
          </button>
        </div>

        {/* 清除筛选 */}
        {(level || searchQuery || startDate || endDate) && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLevel('');
                setSearchQuery('');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={14} />
              清除所有筛选
            </button>
          </div>
        )}
      </div>

      {/* 日志列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {currentFileName && (
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
            当前文件: <span className="font-medium">{currentFileName}</span>
            {total > 0 && (
              <span className="ml-4">
                共 {total} 条日志
                {autoRefresh && (
                  <span className="ml-2 text-blue-600">
                    <Clock size={12} className="inline mr-1" />
                    自动刷新中...
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText size={48} className="mx-auto mb-4 text-gray-300" />
            <p>暂无日志</p>
            {(level || searchQuery || startDate || endDate) && (
              <p className="text-sm text-gray-400 mt-2">尝试调整筛选条件</p>
            )}
          </div>
        ) : (
          <>
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">级别</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">消息</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getLevelBadgeColor(log.level)}`}>
                          {log.level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 font-mono text-xs max-w-4xl truncate" title={log.message}>
                          {log.message}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="查看详情"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
                <div className="text-sm text-gray-500">
                  共 {total} 条日志，第 {page} / {totalPages} 页
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 日志详情模态框 */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">日志详情</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">时间</label>
                  <div className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded">
                    {new Date(selectedLog.timestamp).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      fractionalSecondDigits: 3
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">级别</label>
                  <div>
                    <span className={`inline-flex items-center px-3 py-1 rounded text-sm font-medium border ${getLevelBadgeColor(selectedLog.level)}`}>
                      {selectedLog.level}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">完整消息</label>
                  <pre className="text-sm text-gray-900 font-mono bg-gray-50 p-4 rounded border border-gray-200 overflow-x-auto whitespace-pre-wrap break-words">
                    {selectedLog.raw}
                  </pre>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

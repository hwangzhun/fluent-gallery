import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Tag, X, Plus } from 'lucide-react';
import { tagService } from '../services/tagService';

interface TagSelectorProps {
  value: string; // 逗号分隔的标签字符串
  onChange: (tags: string) => void;
  placeholder?: string;
}

export const TagSelector: React.FC<TagSelectorProps> = ({ 
  value, 
  onChange, 
  placeholder = "输入标签或从列表选择..." 
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // 解析当前标签值 - 使用 useMemo 避免每次渲染都重新计算
  const currentTags = useMemo(() => {
    return value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];
  }, [value]);

  // 加载所有标签
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tags = await tagService.getAllTagNames();
        setAllTags(tags);
      } catch (error) {
        console.error('加载标签列表失败:', error);
      }
    };
    loadTags();
  }, []);

  // 根据输入值过滤建议
  useEffect(() => {
    if (inputValue.trim()) {
      const filtered = allTags
        .filter(tag => 
          tag.toLowerCase().includes(inputValue.toLowerCase()) &&
          !currentTags.includes(tag)
        )
        .slice(0, 8); // 最多显示8个建议
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0 || inputValue.trim().length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
    setSelectedIndex(-1);
  }, [inputValue, allTags, currentTags]);

  // 添加标签
  const addTag = async (tagName: string) => {
    const trimmed = tagName.trim();
    if (!trimmed || currentTags.includes(trimmed)) {
      return;
    }

    // 检查标签是否存在，如果不存在则创建
    if (!allTags.includes(trimmed)) {
      try {
        await tagService.createTag(trimmed);
        // 更新本地标签列表
        setAllTags(prev => [...prev, trimmed].sort());
      } catch (error) {
        console.error('创建标签失败:', error);
        // 即使创建失败，也允许添加（可能标签已存在）
      }
    }

    const newTags = [...currentTags, trimmed];
    onChange(newTags.join(', '));
    setInputValue('');
    setShowSuggestions(false);
  };

  // 删除标签
  const removeTag = (tagToRemove: string) => {
    const newTags = currentTags.filter(tag => tag !== tagToRemove);
    onChange(newTags.join(', '));
  };

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        // 选择建议中的标签
        addTag(suggestions[selectedIndex]);
      } else if (inputValue.trim()) {
        // 创建新标签
        addTag(inputValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    } else if (e.key === 'Backspace' && !inputValue && currentTags.length > 0) {
      // 如果输入框为空，按退格键删除最后一个标签
      removeTag(currentTags[currentTags.length - 1]);
    }
  };

  // 处理建议项点击
  const handleSuggestionClick = (tag: string) => {
    addTag(tag);
  };

  // 点击外部关闭建议列表
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 检查是否可以创建新标签
  const canCreateNew = inputValue.trim() && 
    !allTags.some(tag => tag.toLowerCase() === inputValue.trim().toLowerCase()) &&
    !currentTags.includes(inputValue.trim());

  // 获取未选中的标签列表
  const availableTags = allTags.filter(tag => !currentTags.includes(tag));

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
      
      {/* 已选标签显示 */}
      {currentTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {currentTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-sm"
            >
              <Tag size={12} />
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-blue-900 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div className="relative">
        <Tag size={14} className="absolute left-3 top-3 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(inputValue.trim().length > 0 || suggestions.length > 0)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* 建议下拉列表 */}
      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {suggestions.length > 0 && (
            <div className="py-1">
              {suggestions.map((tag, index) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleSuggestionClick(tag)}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors ${
                    index === selectedIndex ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-gray-400" />
                    <span>{tag}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          
          {canCreateNew && (
            <div className="border-t border-gray-200 py-1">
              <button
                type="button"
                onClick={() => addTag(inputValue)}
                className="w-full text-left px-4 py-2 hover:bg-green-50 transition-colors text-green-700"
              >
                <div className="flex items-center gap-2">
                  <Plus size={14} />
                  <span>创建新标签: "{inputValue.trim()}"</span>
                </div>
              </button>
            </div>
          )}

          {suggestions.length === 0 && !canCreateNew && inputValue.trim() && (
            <div className="px-4 py-2 text-sm text-gray-500">
              输入标签名称并按回车创建
            </div>
          )}
        </div>
      )}

      {/* 已有标签列表 */}
      {availableTags.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-gray-500 mb-2 font-medium">已有标签（点击选择）</div>
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 max-h-40 overflow-y-auto">
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 rounded-md text-sm border border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all cursor-pointer"
              >
                <Tag size={12} />
                <span>{tag}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {availableTags.length === 0 && allTags.length > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          所有标签已选择
        </div>
      )}
    </div>
  );
};


export interface Photo {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  description?: string;
  tags: string[];
  year: number;
  width: number;
  height: number;
  createdAt: string;
  likesCount?: number;  // 点赞数
  isLiked?: boolean;    // 是否已点赞（前端状态）
  viewsCount?: number;  // 浏览量
  exif?: {
    camera: string;
    lens: string;
    aperture: string;
    shutterSpeed: string;
    iso: string;
    author?: string;
    copyright?: string;
    city?: string;
    province?: string;
    country?: string;
  };
}

export type FilterState = {
  year: number | null;
  tag: string | null;
};

export interface PhotoContextType {
  photos: Photo[];
  addPhoto: (photo: Photo) => void;
  deletePhoto: (id: string) => void;
  isLoading: boolean;
}
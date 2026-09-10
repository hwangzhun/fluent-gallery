import { Photo } from './types';

export const MOCK_PHOTOS: Photo[] = [
  {
    id: '1',
    url: 'https://picsum.photos/id/10/1200/800',
    thumbnailUrl: 'https://picsum.photos/id/10/600/400',
    title: 'Forest Path',
    tags: ['Nature', 'Forest'],
    year: 2023,
    width: 1200,
    height: 800,
    createdAt: '2023-05-15T10:00:00Z',
    likesCount: 0,
    viewsCount: 0,
    exif: { camera: 'Sony A7IV', lens: '24-70mm GM', aperture: 'f/2.8', shutterSpeed: '1/200', iso: '100' }
  },
  {
    id: '2',
    url: 'https://picsum.photos/id/11/800/1200',
    thumbnailUrl: 'https://picsum.photos/id/11/400/600',
    title: 'Mountain Lake',
    tags: ['Landscape', 'Water'],
    year: 2023,
    width: 800,
    height: 1200,
    createdAt: '2023-06-20T14:30:00Z',
    likesCount: 0,
    viewsCount: 0,
    exif: { camera: 'Canon R5', lens: '15-35mm RF', aperture: 'f/8', shutterSpeed: '1/60', iso: '200' }
  },
  {
    id: '3',
    url: 'https://picsum.photos/id/12/1000/1000',
    thumbnailUrl: 'https://picsum.photos/id/12/500/500',
    title: 'Beach Sunset',
    tags: ['Sunset', 'Ocean'],
    year: 2022,
    width: 1000,
    height: 1000,
    createdAt: '2022-08-10T18:45:00Z',
    likesCount: 0,
    viewsCount: 0,
    exif: { camera: 'Fujifilm X-T4', lens: '23mm f/1.4', aperture: 'f/1.4', shutterSpeed: '1/1000', iso: '160' }
  },
  {
    id: '4',
    url: 'https://picsum.photos/id/13/1200/600',
    thumbnailUrl: 'https://picsum.photos/id/13/600/300',
    title: 'City Skyline',
    tags: ['Urban', 'Architecture'],
    year: 2024,
    width: 1200,
    height: 600,
    createdAt: '2024-01-05T20:00:00Z',
    likesCount: 0,
    viewsCount: 0,
    exif: { camera: 'Sony A7R V', lens: '50mm GM', aperture: 'f/5.6', shutterSpeed: '2s', iso: '50' }
  },
  {
    id: '5',
    url: 'https://picsum.photos/id/14/800/1000',
    thumbnailUrl: 'https://picsum.photos/id/14/400/500',
    title: 'Portrait in Studio',
    tags: ['Portrait', 'People'],
    year: 2023,
    width: 800,
    height: 1000,
    createdAt: '2023-11-12T11:20:00Z',
    likesCount: 0,
    viewsCount: 0,
    exif: { camera: 'Canon R6', lens: '85mm RF', aperture: 'f/1.2', shutterSpeed: '1/250', iso: '100' }
  },
  {
    id: '6',
    url: 'https://picsum.photos/id/15/1200/1600',
    thumbnailUrl: 'https://picsum.photos/id/15/600/800',
    title: 'Waterfall',
    tags: ['Nature', 'Water'],
    year: 2022,
    width: 1200,
    height: 1600,
    createdAt: '2022-04-22T09:15:00Z',
    likesCount: 0,
    viewsCount: 0,
    exif: { camera: 'Nikon Z7 II', lens: '14-24mm', aperture: 'f/11', shutterSpeed: '1s', iso: '64' }
  },
  {
    id: '7',
    url: 'https://picsum.photos/id/16/900/600',
    thumbnailUrl: 'https://picsum.photos/id/16/450/300',
    title: 'Coffee Shop',
    tags: ['Lifestyle', 'Urban'],
    year: 2024,
    width: 900,
    height: 600,
    createdAt: '2024-02-14T15:00:00Z',
    likesCount: 0,
    viewsCount: 0,
    exif: { camera: 'Leica Q2', lens: '28mm Summilux', aperture: 'f/2.0', shutterSpeed: '1/125', iso: '400' }
  },
  {
    id: '8',
    url: 'https://picsum.photos/id/17/800/800',
    thumbnailUrl: 'https://picsum.photos/id/17/400/400',
    title: 'Minimalist Architecture',
    tags: ['Architecture', 'Abstract'],
    year: 2023,
    width: 800,
    height: 800,
    createdAt: '2023-09-09T13:40:00Z',
    likesCount: 0,
    viewsCount: 0,
    exif: { camera: 'Sony A7IV', lens: '35mm GM', aperture: 'f/4', shutterSpeed: '1/500', iso: '100' }
  }
];

export const AVAILABLE_TAGS = Array.from(new Set(MOCK_PHOTOS.flatMap(p => p.tags))).sort();
export const AVAILABLE_YEARS = Array.from(new Set(MOCK_PHOTOS.map(p => p.year))).sort((a, b) => b - a);

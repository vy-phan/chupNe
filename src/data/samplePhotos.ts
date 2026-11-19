import portraitUrl from '../assets/images/sample_portrait_1794222303003.jpg';
import sunsetUrl from '../assets/images/sample_sunset_1794222303398.jpg';
import streetUrl from '../assets/images/sample_street_1794222302896.jpg';

export interface SamplePhotoItem {
  id: string;
  name: string;
  category: string;
  url: string;
  aspectRatio: string;
}

export const SAMPLE_PHOTOS: SamplePhotoItem[] = [
  {
    id: 'sample_portrait',
    name: 'Chân dung Studio',
    category: 'Chân dung',
    url: portraitUrl,
    aspectRatio: '4:3',
  },
  {
    id: 'sample_sunset',
    name: 'Hoàng hôn Biển',
    category: 'Phong cảnh',
    url: sunsetUrl,
    aspectRatio: '4:3',
  },
  {
    id: 'sample_street',
    name: 'Phố đêm Neon',
    category: 'Điện ảnh',
    url: streetUrl,
    aspectRatio: '4:3',
  },
];

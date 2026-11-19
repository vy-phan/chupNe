import React, { useEffect, useState } from 'react';
import { CameraScreen } from './components/CameraScreen';
import { OnboardingModal } from './components/OnboardingModal';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { ReviewScreen } from './components/ReviewScreen';
import { StudioScreen } from './components/StudioScreen';
import { SamplePhotoItem } from './data/samplePhotos';
import { CapturedPhoto } from './types/filter';

type Screen = 'camera' | 'review' | 'studio';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('camera');
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [activePhoto, setActivePhoto] = useState<CapturedPhoto | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check first-time onboarding
  useEffect(() => {
    const isDone = localStorage.getItem('chup_ne_onboarding_done');
    if (!isDone) {
      setShowOnboarding(true);
    }
  }, []);

  // When photos captured from Camera Screen
  const handlePhotosCaptured = (photos: CapturedPhoto[]) => {
    setCapturedPhotos(photos);
    setActivePhoto(photos[0]);
    setCurrentScreen('review');
  };

  // When user selects a file from disk / gallery
  const handlePhotoPickedFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const photo: CapturedPhoto = {
          id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          blob: file,
          dataUrl,
          width: img.naturalWidth || 1200,
          height: img.naturalHeight || 900,
          aspectRatio: 'custom',
          capturedAt: Date.now(),
          initialFilterId: 'portra400',
          initialIntensity: 85,
        };
        setCapturedPhotos([photo]);
        setActivePhoto(photo);
        // Direct to Studio
        setCurrentScreen('studio');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // When user picks a preset sample photo
  const handleSelectSamplePhoto = async (sample: SamplePhotoItem) => {
    try {
      const response = await fetch(sample.url);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const photo: CapturedPhoto = {
            id: `sample_${sample.id}_${Date.now()}`,
            blob,
            dataUrl,
            width: img.naturalWidth || 1200,
            height: img.naturalHeight || 900,
            aspectRatio: sample.aspectRatio,
            capturedAt: Date.now(),
            initialFilterId: 'portra400',
            initialIntensity: 85,
          };
          setCapturedPhotos([photo]);
          setActivePhoto(photo);
          setCurrentScreen('studio');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Failed to load sample photo:', err);
    }
  };

  // Global drag & drop support
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        handlePhotoPickedFromFile(file);
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <div className="relative w-full h-[100dvh] bg-[#FFF9FB] text-[#3D242E] overflow-hidden font-sans">
      {/* PWA Install Banner */}
      <PWAInstallBanner />

      {/* Screen 1: Camera */}
      {currentScreen === 'camera' && (
        <CameraScreen
          onPhotosCaptured={handlePhotosCaptured}
          onOpenPhotoPicker={handlePhotoPickedFromFile}
          onSelectSamplePhoto={handleSelectSamplePhoto}
          onOpenHelp={() => setShowOnboarding(true)}
        />
      )}

      {/* Screen 2: Review Captured Photo */}
      {currentScreen === 'review' && capturedPhotos.length > 0 && (
        <ReviewScreen
          photos={capturedPhotos}
          onRetake={() => setCurrentScreen('camera')}
          onUsePhoto={(photo) => {
            setActivePhoto(photo);
            setCurrentScreen('studio');
          }}
        />
      )}

      {/* Screen 3: Studio & Colorist Grading */}
      {currentScreen === 'studio' && activePhoto && (
        <StudioScreen
          key={activePhoto.id}
          currentPhoto={activePhoto}
          onBackToCamera={() => setCurrentScreen('camera')}
          onOpenPhotoPicker={handlePhotoPickedFromFile}
          onSelectSamplePhoto={handleSelectSamplePhoto}
          onOpenHelp={() => setShowOnboarding(true)}
        />
      )}

      {/* Onboarding Guide Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
}



import React, { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react';
import type { Message, Gender, Tone } from './types';
import { REGIONS } from './constants';
import { getWeatherAndRecommendation, getTextRecommendation, getImageRecommendation, generateOutfitImage, getRegionFromCoords, generateOutfitFromLikedImages, getAlternativeOutfitSuggestion } from './services/geminiService';

const initialMessage: Message = {
  id: 1,
  role: 'assistant',
  // FIX: Switched to double quotes to fix syntax error with inner single quotes.
  text: "안녕하세요! 저는 웨어리예요. '설정'에서 지역, 성별, 말투를 선택하시거나, 위치 정보 제공에 동의하시면 날씨에 딱 맞는 코디를 추천해드릴게요!"
};

// --- Tone-specific Message Helpers ---

const getWeatherReportMessage = (tone: Tone, region: string, data: { summary: string, minTemp: number, maxTemp: number }): string => {
  switch (tone) {
    case 'critical':
      return `${region} 날씨. ${data.summary}. 최저 ${data.minTemp}°C, 최고 ${data.maxTemp}°C. 됐지?`;
    case 'witty':
      return `오늘 ${region} 날씨는 말이야~ ${data.summary}에 최저 ${data.minTemp}°C, 최고 ${data.maxTemp}°C까지 오르락내리락 할 예정! ㅋㅋ`;
    case 'friendly':
    default:
      return `${region}의 오늘 날씨는 ${data.summary} (최저 ${data.minTemp}°C / 최고 ${data.maxTemp}°C) 예요.`;
  }
};

const getGenderChangeConfirmationMessage = (tone: Tone, genderText: string): string => {
    switch (tone) {
        case 'critical':
            return `'${genderText}'(으)로 변경. 알았으니까 이제 말 걸어.`;
        case 'witty':
            return `오, '${genderText}'(으)로 변신! ✨ 알겠다고~ 맞춰서 추천해주지!`;
        case 'friendly':
        default:
            return `성별이 '${genderText}'(으)로 변경되었어요! 앞으로 추천에 반영할게요.`;
    }
}

const getWeatherErrorMessage = (tone: Tone, error: string): string => {
  switch (tone) {
    case 'critical':
      return `날씨 보다가 에러남. (${error})`;
    case 'witty':
      return `날씨의 신이 노하셨나... 에러...😱 (${error})`;
    case 'friendly':
    default:
      return `날씨 확인 중 오류가 발생했어요: ${error}`;
  }
};

const getImageGenerationPlaceholderMessage = (tone: Tone): string => {
  switch (tone) {
    case 'critical':
      return '이미지 만드는 중. 재촉 마.';
    case 'witty':
      return '예술혼 불태우는 중... 잠시만. 🎨';
    case 'friendly':
    default:
      return '제안된 코디 이미지를 만들고 있어요... 🎨';
  }
};

const getImageGenerationSuccessMessage = (tone: Tone): string => {
  switch (tone) {
    case 'critical':
      return '자, 보던가.';
    case 'witty':
      return '훗, 이 몸이 좀 감각있지. 😎';
    case 'friendly':
    default:
      return '짠! 요청하신 코디 이미지예요. ✨';
  }
};

const getImageGenerationErrorMessage = (tone: Tone, error: string): string => {
  switch (tone) {
    case 'critical':
      return `이미지 만들다 에러남. 알아서 해. (${error})`;
    case 'witty':
      return `아놔, 내 예술혼이 거부 반응을... 🤯 에러: ${error}`;
    case 'friendly':
    default:
      return `이미지 생성 중 오류가 발생했어요: ${error}`;
  }
};

const getAnalysisPlaceholderMessage = (isImage: boolean, tone: Tone): string => {
    if (isImage) {
        switch (tone) {
            case 'critical':
                return '사진 보는 중. 평가해주지.';
            case 'witty':
                return '어디보자... 패션 감별 들어갑니다~ 🕵️';
            case 'friendly':
            default:
                return '사진을 분석하고 있어요... 📸';
        }
    } else {
        switch (tone) {
            case 'critical':
                return '...생각 중.';
            case 'witty':
                return '흐음... 기가 막힌 추천을 위한 빌드업 중... 🤔';
            case 'friendly':
            default:
                return '코디를 추천하고 있어요... ✍️';
        }
    }
};

const getAnalysisErrorMessage = (isImage: boolean, tone: Tone, error: string): string => {
    if (isImage) {
        switch (tone) {
            case 'critical':
                return `사진 보다 에러남. (${error})`;
            case 'witty':
                return `이런, 사진이 너무 눈부셨나... 에러! ✨ (${error})`;
            case 'friendly':
            default:
                return `이미지 처리 중 오류가 발생했어요: ${error}`;
        }
    } else {
        switch (tone) {
            case 'critical':
                return `추천하다 에러남. (${error})`;
            case 'witty':
                return `뇌세포 과부하! 추천 엔진 터짐... 🤯 (${error})`;
            case 'friendly':
            default:
                return `오류가 발생했어요: ${error}`;
        }
    }
};

const getWeatherProgressMessages = (tone: Tone, region: string): { text: string; delay: number }[] => {
  switch (tone) {
    case 'critical':
      return [
        { text: `📍 ${region}이라... 알았어.`, delay: 700 },
        { text: `🌦️ 날씨 정보? 가져오면 될 거 아냐.`, delay: 1000 },
        { text: `🤔 대충 보고 있으니 기다려.`, delay: 0 },
      ];
    case 'witty':
      return [
        { text: `📍 ${region}(으)로 순간이동! 슝~`, delay: 700 },
        { text: `🌦️ 하늘에다 물어보는 중... "오늘 날씨 뭐냐!"`, delay: 1000 },
        { text: `🤔 내 패션 AI가 열일하는 중이니 잠시만!`, delay: 0 },
      ];
    case 'friendly':
    default:
      return [
        { text: `📍 ${region} 지역에 접속하고 있어요.`, delay: 700 },
        { text: `🌦️ 오늘의 날씨 정보를 가져오는 중...`, delay: 1000 },
        { text: `🤔 날씨를 분석해 코디를 짜고 있어요...`, delay: 0 },
      ];
  }
};


interface SettingsModalProps {
  currentRegion: string;
  currentGender: Gender;
  currentTone: Tone;
  currentColors: string[];
  currentProfileImage: string | null;
  currentHeight: string;
  currentWeight: string;
  onClose: () => void;
  onApply: (settings: { 
    region: string; 
    gender: Gender; 
    tone: Tone, 
    colors: string[], 
    profileImage: string | null, 
    height: string, 
    weight: string 
  }) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  currentRegion, currentGender, currentTone, currentColors, 
  currentProfileImage, currentHeight, currentWeight,
  onClose, onApply 
}) => {
  const [selectedRegion, setSelectedRegion] = useState(currentRegion);
  const [selectedGender, setSelectedGender] = useState(currentGender);
  const [selectedTone, setSelectedTone] = useState(currentTone);
  const [selectedColors, setSelectedColors] = useState(currentColors);
  const [selectedProfileImage, setSelectedProfileImage] = useState<string | null>(currentProfileImage);
  const [selectedHeight, setSelectedHeight] = useState(currentHeight);
  const [selectedWeight, setSelectedWeight] = useState(currentWeight);
  const [isLocating, setIsLocating] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  const genderOptions: { value: Gender, label: string }[] = [
    { value: 'male', label: '남성' },
    { value: 'female', label: '여성' },
    { value: '', label: '상관없음' },
  ];
  
  const toneOptions: { value: Tone, label: string }[] = [
    { value: 'friendly', label: '친절한 튜터' },
    { value: 'witty', label: '쾌활한 친구' },
    { value: 'critical', label: '까칠한 친구' },
  ];
  
  const colorPalette = [
    { name: '블랙', value: '#2F2F2F' },
    { name: '화이트', value: '#FFFFFF' },
    { name: '그레이', value: '#808080' },
    { name: '베이지', value: '#F5F5DC' },
    { name: '네이비', value: '#000080' },
    { name: '카키', value: '#C3B091' },
    { name: '블루', value: '#ADD8E6' },
    { name: '그린', value: '#90EE90' },
    { name: '핑크', value: '#FFC0CB' },
    { name: '레드', value: '#FF6347' },
  ];

  const lightColorsForCheckmark = [
    '화이트', '베이지', '블루', '그린', '핑크', '레드'
  ];

  const handleColorToggle = (colorName: string) => {
    setSelectedColors(prev =>
      prev.includes(colorName)
        ? prev.filter(c => c !== colorName)
        : prev.length < 10 ? [...prev, colorName] : prev
    );
  };
  
  const handleProfileImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = () => {
            setSelectedProfileImage(reader.result as string);
        };
        reader.readAsDataURL(file);
    }
  };


  const handleApply = () => {
    if (!selectedRegion) {
        alert('지역을 선택해주세요.');
        return;
    }
    onApply({ 
      region: selectedRegion, 
      gender: selectedGender, 
      tone: selectedTone, 
      colors: selectedColors,
      profileImage: selectedProfileImage,
      height: selectedHeight,
      weight: selectedWeight,
    });
  };

  const handleGetCurrentLocation = useCallback(() => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const region = await getRegionFromCoords(latitude, longitude);
          if (region) {
            setSelectedRegion(region);
          } else {
            alert('현재 위치의 지역을 찾을 수 없습니다. 직접 선택해주세요.');
          }
        } catch (error) {
           alert('지역을 변환하는 중 오류가 발생했습니다.');
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        alert('위치 정보를 가져올 수 없습니다. 브라우저 설정을 확인해주세요.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl animate-fade-in-up dark:bg-gray-800 overflow-y-auto max-h-[90vh] md:max-h-[85vh] no-scrollbar">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">설정</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">나만의 프로필과 스타일을 설정해주세요.</p>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 -mt-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:bg-gray-700" aria-label="Close settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-4 mb-8">
            <div className="relative">
                <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={profileImageInputRef} 
                    onChange={handleProfileImageChange} 
                />
                <div 
                    onClick={() => profileImageInputRef.current?.click()}
                    className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center cursor-pointer overflow-hidden ring-2 ring-offset-2 dark:ring-offset-gray-800 ring-gray-300 dark:ring-gray-600 hover:ring-purple-500 transition-all"
                >
                    {selectedProfileImage ? (
                        <img src={selectedProfileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    )}
                </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
                <div>
                    <label htmlFor="height" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">키 (cm)</label>
                    <input 
                        type="number" 
                        id="height" 
                        value={selectedHeight}
                        onChange={(e) => setSelectedHeight(e.target.value)}
                        onFocus={(e) => { if (e.currentTarget.value === '') setSelectedHeight('175'); }}
                        placeholder="175"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400 transition dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                </div>
                <div>
                    <label htmlFor="weight" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">몸무게 (kg)</label>
                    <input 
                        type="number" 
                        id="weight" 
                        value={selectedWeight}
                        onChange={(e) => setSelectedWeight(e.target.value)}
                        onFocus={(e) => { if (e.currentTarget.value === '') setSelectedWeight('65'); }}
                        placeholder="65"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400 transition dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                </div>
            </div>
        </div>
        
        <div className="mb-6">
          <h3 className="text-md font-semibold text-gray-700 mb-3 dark:text-gray-300">말투</h3>
          <div className="grid grid-cols-3 gap-3">
            {toneOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSelectedTone(value)}
                className={`py-1.5 rounded-xl border transition-all duration-200 dark:border-gray-600 ${
                  selectedTone === value
                    ? 'ring-2 ring-purple-500 bg-purple-50 text-purple-700 font-semibold shadow-md dark:ring-purple-400 dark:bg-purple-900/50 dark:text-purple-200'
                    : 'bg-gray-50 hover:bg-gray-100 hover:shadow-sm text-gray-800 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-md font-semibold text-gray-700 mb-3 dark:text-gray-300">성별</h3>
          <div className="grid grid-cols-3 gap-3">
            {genderOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSelectedGender(value)}
                className={`py-1.5 rounded-xl border transition-all duration-200 dark:border-gray-600 ${
                  selectedGender === value
                    ? 'ring-2 ring-purple-500 bg-purple-50 text-purple-700 font-semibold shadow-md dark:ring-purple-400 dark:bg-purple-900/50 dark:text-purple-200'
                    : 'bg-gray-50 hover:bg-gray-100 hover:shadow-sm text-gray-800 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
                 <h3 className="text-md font-semibold text-gray-700 dark:text-gray-300">지역</h3>
                 <button onClick={handleGetCurrentLocation} disabled={isLocating} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-sm font-medium hover:bg-purple-200 transition-all disabled:opacity-60 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-800/70">
                    {isLocating ? (
                        <>
                        <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>위치 찾는 중...</span>
                        </>
                    ) : (
                        <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                        <span>현재 위치로 설정</span>
                        </>
                    )}
                </button>
            </div>
            <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400 transition dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                aria-label="지역 선택"
            >
                <option value="" disabled>지역을 선택하세요</option>
                {REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                ))}
            </select>
        </div>

        <div className="mb-6">
          <h3 className="text-md font-semibold text-gray-700 mb-3 dark:text-gray-300">선호 색상</h3>
          <div className="grid grid-cols-11 gap-2">
            <button
                onClick={() => setSelectedColors([])}
                className={`aspect-square rounded-full border-2 transition-all duration-200 flex items-center justify-center shadow-inner bg-gray-200 dark:bg-gray-600 ${
                    selectedColors.length === 0
                    ? 'ring-2 ring-offset-2 ring-purple-500 dark:ring-offset-gray-800'
                    : 'border-gray-300 dark:border-gray-500'
                }`}
                aria-label="선호 색상 선택 안함"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
            </button>
            {colorPalette.map(({ name, value }) => (
              <button
                key={name}
                onClick={() => handleColorToggle(name)}
                className={`aspect-square rounded-full border-2 transition-all duration-200 flex items-center justify-center shadow-inner ${
                  selectedColors.includes(name)
                    ? 'ring-2 ring-offset-2 ring-purple-500 dark:ring-offset-gray-800'
                    : value === '#FFFFFF' ? 'border-gray-300' : 'border-transparent'
                }`}
                style={{ backgroundColor: value }}
                aria-label={`${name} 색상 선택`}
              >
                {selectedColors.includes(name) && (
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${lightColorsForCheckmark.includes(name) ? 'text-black/70' : 'text-white/80'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600">취소</button>
          <button onClick={handleApply} className="px-5 py-2 rounded-xl bg-purple-600 text-white font-medium shadow-lg hover:bg-purple-700 transition-all disabled:opacity-50">적용</button>
        </div>
      </div>
    </div>
  );
};

interface HistoryModalProps {
  messages: Message[];
  onClose: () => void;
  onDelete: (messageId: number) => void;
  onRecommendFromSelected: (images: string[]) => void;
  onRecommendFromAll: (images: string[]) => void;
  onImageClick: (imageUrl: string) => void;
  onAddImage: (file: File) => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ messages, onClose, onDelete, onRecommendFromSelected, onRecommendFromAll, onImageClick, onAddImage }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  const likedItems = messages.filter(
    (m) => m.feedback === 'like' && (m.generatedImage || m.image)
  );
  
  const handleSelectToggle = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const handleRecommendSelectedClick = () => {
    const selectedItems = likedItems.filter(item => selectedIds.includes(item.id));
    const imageSources = selectedItems.map(item => item.generatedImage || item.image!).filter(Boolean);
    if (imageSources.length > 0) {
        onRecommendFromSelected(imageSources);
    }
  };

  const handleRecommendAllClick = () => {
    const imageSources = likedItems.map(item => item.generatedImage || item.image!).filter(Boolean);
    if (imageSources.length > 0) {
        onRecommendFromAll(imageSources);
    }
  };
  
  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        onAddImage(files[i]);
      }
    }
    if (event.target) {
        event.target.value = '';
    }
  };


  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white rounded-2xl p-6 shadow-2xl flex flex-col dark:bg-gray-800 max-h-[90vh] md:max-h-[85vh]">
        <div className="flex items-start justify-between mb-6 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">내코디</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">마음에 드는 스타일을 선택해 추천받아보세요.</p>
          </div>
          <div className="flex items-center gap-4">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*"
                multiple
            />
            <button 
                onClick={handleAddClick}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-800/70"
            >
              사진 추가
            </button>
            <button onClick={onClose} className="p-1 -mr-1 -mt-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:bg-gray-700" aria-label="Close history">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {likedItems.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {likedItems.map((item) => (
                <div key={item.id} className="aspect-square rounded-lg overflow-hidden shadow-md group relative">
                  <img 
                    src={item.generatedImage || item.image} 
                    alt="Liked outfit" 
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                    onClick={() => onImageClick(item.generatedImage || item.image!)}
                  />
                  <div className={`absolute inset-0 rounded-lg ring-2 ring-offset-2 ring-purple-500 pointer-events-none transition-opacity duration-200 dark:ring-offset-gray-800 ${selectedIds.includes(item.id) ? 'opacity-100' : 'opacity-0'}`}></div>
                   <button
                        onClick={() => handleSelectToggle(item.id)}
                        className="absolute top-2 left-2 w-7 h-7 z-10 rounded-full flex items-center justify-center bg-white/80 backdrop-blur-sm shadow-md transition-all duration-200 hover:scale-110"
                        aria-label="Select item"
                    >
                        {selectedIds.includes(item.id) ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-500 bg-white/50"></div>
                        )}
                    </button>
                  {item.role === 'user' && (
                    <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md z-10 pointer-events-none">
                        MY
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm('정말 이 코디를 삭제하시겠어요?')) {
                        onDelete(item.id);
                      }
                    }}
                    className="absolute bottom-2 right-2 bg-black/50 text-white rounded-full p-1.5 leading-none shadow-md hover:bg-red-500 transition-colors opacity-0 group-hover:opacity-100 z-10"
                    aria-label="Remove from history"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <h3 className="text-lg font-semibold">아직 좋아요한 코디가 없어요.</h3>
              <p className="mt-1 text-sm">추천받은 이미지나 내 사진에 ❤️를 눌러 저장해보세요!</p>
            </div>
          )}
        </div>
        
        {likedItems.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 shrink-0">
                <div className="flex gap-3">
                    <button
                        onClick={handleRecommendSelectedClick}
                        disabled={selectedIds.length === 0}
                        className="w-1/2 px-4 py-3 rounded-xl bg-purple-600 text-white font-medium shadow-lg hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                    >
                        {selectedIds.length > 0 ? `선택 ${selectedIds.length}개로 추천` : '코디 선택 후 추천'}
                    </button>
                    <button
                        onClick={handleRecommendAllClick}
                        className="w-1/2 px-4 py-3 rounded-xl bg-white border border-gray-300 text-gray-800 font-medium shadow-sm hover:bg-gray-50 transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600 text-sm sm:text-base"
                    >
                        전체로 추천
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

interface ImageZoomModalProps {
  imageUrl: string;
  onClose: () => void;
}

const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ imageUrl, onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div className="relative max-w-3xl max-h-[90vh]">
        <img 
          src={imageUrl} 
          alt="Zoomed-in outfit" 
          className="rounded-xl object-contain w-full h-full"
          onClick={(e) => e.stopPropagation()}
        />
        <button 
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-white text-gray-800 rounded-full p-2 leading-none shadow-lg hover:scale-110 transition-transform"
          aria-label="Close zoomed image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
};


const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [region, setRegion] = useState('');
  const [gender, setGender] = useState<Gender>('');
  const [tone, setTone] = useState<Tone>('friendly');
  const [colors, setColors] = useState<string[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [lastOutfitSuggestion, setLastOutfitSuggestion] = useState<string>('');
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const messageIdCounter = useRef(initialMessage.id);

  // --- Dark Mode Logic ---
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const getNewMessageId = useCallback(() => {
    messageIdCounter.current += 1;
    return messageIdCounter.current;
  }, []);

  const addMessage = useCallback((role: 'user' | 'assistant', text: string, image?: string, generatedImage?: string, loadingImage?: boolean): number => {
    const newId = getNewMessageId();
    const newMessage: Message = { id: newId, role, text, image, generatedImage, loadingImage, feedback: null };
    setMessages(prev => [...prev, newMessage]);
    return newId;
  }, [getNewMessageId]);
  
  const handleSettingsApply = useCallback(async (settings: { 
    region: string, 
    gender: Gender, 
    tone: Tone, 
    colors: string[],
    profileImage: string | null,
    height: string,
    weight: string,
  }) => {
    setSettingsOpen(false);

    const {
        region: newRegion,
        gender: newGender,
        tone: newTone,
        colors: newColors,
        profileImage: newProfileImage,
        height: newHeight,
        weight: newWeight,
    } = settings;

    const regionChanged = newRegion !== region;
    const genderChanged = newGender !== gender;
    const toneChanged = newTone !== tone;
    const colorsChanged = JSON.stringify(newColors.sort()) !== JSON.stringify(colors.sort());
    const physicalInfoChanged = newHeight !== height || newWeight !== weight || newProfileImage !== profileImage;

    const settingsChanged = regionChanged || genderChanged || toneChanged || colorsChanged || physicalInfoChanged;

    if (!settingsChanged) return;

    // We'll show a user message for the settings change regardless
    const genderText = (g: Gender) => g === 'male' ? '남성' : g === 'female' ? '여성' : '상관없음';
    const toneText = (t: Tone) => t === 'critical' ? '까칠한 친구' : t === 'witty' ? '쾌활한 친구' : '친절한 튜터';
    const colorsText = newColors.length > 0 ? `, 선호색: ${newColors.join(', ')}` : '';
    const physicalInfoText = newHeight || newWeight ? `, 신체정보 변경` : '';
    const profileImageText = newProfileImage !== profileImage ? ', 프로필 사진 변경' : '';
    const userMessage = `설정 변경: ${newRegion}, ${genderText(newGender)}, ${toneText(newTone)}${colorsText}${physicalInfoText}${profileImageText}`;
    addMessage('user', userMessage);

    setRegion(newRegion);
    setGender(newGender);
    setTone(newTone);
    setColors(newColors);
    setProfileImage(newProfileImage);
    setHeight(newHeight);
    setWeight(newWeight);

    if (regionChanged) {
        setQuickReplies([]);
        setIsLoading(true);
        const placeholderId = addMessage('assistant', '...');

        const progressSteps = getWeatherProgressMessages(newTone, newRegion);

        (async () => {
            try {
                for (const step of progressSteps) {
                    setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: step.text } : m));
                    if (step.delay > 0) {
                        await new Promise(resolve => setTimeout(resolve, step.delay));
                    }
                }
                const data = await getWeatherAndRecommendation(newRegion, newGender, newTone, newColors, newHeight, newWeight);
                setLastOutfitSuggestion(data.suggestion);
                const weatherText = getWeatherReportMessage(newTone, newRegion, data);
                const combinedText = `${weatherText}\n\n${data.suggestion}`;
                setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: combinedText, generatedImage: undefined } : m));
                setQuickReplies(['코디 이미지 보여줘', '활동량 많은 날엔?', '저녁 약속엔 뭐 입지?']);
            } catch (e) {
                const error = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
                setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: getWeatherErrorMessage(newTone, error) } : m));
                setQuickReplies(['날씨 알려줘']);
            } finally {
                setIsLoading(false);
            }
        })();
    } else {
        addMessage('assistant', '설정이 업데이트되었어요! 앞으로 추천에 반영할게요. 😉');
        setQuickReplies([]);
    }
  }, [addMessage, region, gender, tone, colors, height, weight, profileImage]);


  useEffect(() => {
    const scrollTimeout = setTimeout(() => {
      if (chatListRef.current) {
        chatListRef.current.scrollTo({ top: chatListRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 100);
  
    return () => clearTimeout(scrollTimeout);
  }, [messages]);

  const handleSend = useCallback(async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    
    if (!region || !tone) {
        setSettingsOpen(true);
        return;
    }

    const isImageRequest = ['코디 이미지 보여줘', '이 코디 이미지로 보여줘', '제안된 코디 이미지로 보여줘'].includes(text);

    if (isImageRequest && lastOutfitSuggestion) {
      addMessage('user', text);
      setInput('');
      setQuickReplies([]);
      setIsLoading(true);
      
      const placeholderId = addMessage('assistant', '', undefined, undefined, true);
      const currentSuggestion = lastOutfitSuggestion;
      setLastOutfitSuggestion('');

      try {
        const imageUrl = await generateOutfitImage(currentSuggestion, gender, profileImage, height, weight);
        if (imageUrl) {
            setMessages(prev => prev.map(m => m.id === placeholderId ? {...m, text: '', generatedImage: imageUrl, loadingImage: false, imagePrompt: currentSuggestion } : m));
            addMessage('assistant', getImageGenerationSuccessMessage(tone));
        } else {
            const error = '이미지를 생성하지 못했습니다.';
            setMessages(prev => prev.map(m => m.id === placeholderId ? {...m, text: getImageGenerationErrorMessage(tone, error), loadingImage: false} : m));
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
        setMessages(prev => prev.map(m => m.id === placeholderId ? {...m, text: getImageGenerationErrorMessage(tone, error), loadingImage: false} : m));
      } finally {
        setIsLoading(false);
      }
      return;
    }


    if ((!text && !imageFile) || isLoading) return;

    const currentImageFile = imageFile;
    let userImageURL: string | undefined;

    if (currentImageFile) {
        try {
            userImageURL = await fileToDataURL(currentImageFile);
        } catch (error) {
            console.error("Error converting file to data URL:", error);
            addMessage('assistant', '이미지를 처리하는 데 오류가 발생했습니다.');
            setIsLoading(false);
            return;
        }
    }
    
    if (userImageURL) {
      addMessage('user', '', userImageURL);
    }
    if (text) {
        addMessage('user', text);
    }

    setInput('');
    setQuickReplies([]);
    setIsLoading(true);

    setImageFile(null);
    if(fileInputRef.current) fileInputRef.current.value = "";

    const placeholderText = getAnalysisPlaceholderMessage(!!currentImageFile, tone);
    const placeholderId = addMessage('assistant', placeholderText);

    try {
      if (currentImageFile) {
        const data = await getImageRecommendation(currentImageFile, text, region, gender, tone, colors, height, weight);
        
        setMessages(prev => prev.map(m => m.id === placeholderId ? {...m, text: data.analysis } : m));
        
        setTimeout(() => {
            addMessage('assistant', data.suggestion);
            setLastOutfitSuggestion(data.suggestion);
        }, 500);

        setQuickReplies(data.quickReplies);

      } else {
        const data = await getTextRecommendation(text, region, gender, tone, colors, height, weight);
        setMessages(prev => prev.map(m => m.id === placeholderId ? {...m, text: data.advice, generatedImage: undefined } : m));
        setLastOutfitSuggestion(data.advice);
        setQuickReplies(data.quickReplies);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
      const errorMessage = getAnalysisErrorMessage(!!currentImageFile, tone, error);
      setMessages(prev => prev.map(m => m.id === placeholderId ? {...m, text: errorMessage } : m));
    } finally {
      setIsLoading(false);
    }
  }, [input, imageFile, isLoading, region, gender, tone, colors, height, weight, addMessage, lastOutfitSuggestion, profileImage]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
  }, []);

  const handleFeedback = useCallback(async (message: Message, feedback: 'like' | 'dislike' | null) => {
    const newFeedback = message.feedback === feedback ? null : feedback;
    
    setMessages(prev =>
      prev.map(m => m.id === message.id ? { ...m, feedback: newFeedback } : m)
    );

    if (newFeedback === 'dislike' && message.generatedImage && message.imagePrompt) {
      setIsLoading(true);
      setQuickReplies([]);
      addMessage('user', '다른 스타일 보여줘');
      const placeholderId = addMessage('assistant', getAnalysisPlaceholderMessage(false, tone));
      
      try {
        const data = await getAlternativeOutfitSuggestion(message.imagePrompt, region, gender, tone, colors, height, weight);
        setMessages(prev => prev.map(m => 
          m.id === placeholderId ? { ...m, text: data.suggestion } : m
        ));
        setLastOutfitSuggestion(data.suggestion);
        setQuickReplies(data.quickReplies);
      } catch (e) {
        const error = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
        const errorMessage = getAnalysisErrorMessage(false, tone, error);
        setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: errorMessage } : m));
      } finally {
        setIsLoading(false);
      }
    }
  }, [addMessage, region, gender, tone, colors, height, weight]);

  const handleDeleteLikedImage = useCallback((messageId: number) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, feedback: null } : m
      )
    );
  }, []);

  const handleRecommendationFromHistory = useCallback(async (images: string[], source: 'selected' | 'all') => {
    setHistoryOpen(false);
    
    if (!region || !tone) {
        setSettingsOpen(true);
        return;
    }

    const userMessage = source === 'selected' 
        ? `${images.length}개의 선택한 코디로 새로운 스타일 추천!`
        : '내코디 전체 스타일로 새로운 추천!';
    addMessage('user', userMessage);
    
    setIsLoading(true);
    setQuickReplies([]);
    
    const placeholderId = addMessage('assistant', '', undefined, undefined, true);
    
    try {
        const { imageUrl, suggestion } = await generateOutfitFromLikedImages(images, region, gender, tone, colors, height, weight, profileImage);
        
        if (imageUrl) {
            setMessages(prev => prev.map(m => m.id === placeholderId ? {
                ...m,
                text: '', 
                generatedImage: imageUrl, 
                loadingImage: false, 
                imagePrompt: suggestion
            } : m));
            addMessage('assistant', getImageGenerationSuccessMessage(tone));
        } else {
            const error = '이미지를 생성하지 못했습니다.';
            setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, text: getImageGenerationErrorMessage(tone, error), loadingImage: false} : m));
        }
    } catch (e) {
        const error = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
        setMessages(prev => prev.map(m => m.id === placeholderId ? {...m, text: getImageGenerationErrorMessage(tone, error), loadingImage: false} : m));
    } finally {
        setIsLoading(false);
    }
  }, [addMessage, region, gender, tone, colors, height, weight, profileImage]);

  const handleAddImageToHistory = useCallback(async (file: File) => {
    try {
        const userImageURL = await fileToDataURL(file);
        const newId = getNewMessageId();
        const newMessage: Message = {
            id: newId,
            role: 'user',
            text: '',
            image: userImageURL,
            feedback: 'like',
            historyOnly: true,
        };
        setMessages(prev => [...prev, newMessage]);
    } catch (error) {
        console.error("Error adding image to history:", error);
        addMessage('assistant', '이미지를 내코디에 추가하는 데 실패했습니다.');
    }
  }, [getNewMessageId, addMessage]);


  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-100 sm:p-4 dark:from-gray-900 dark:via-purple-900/50 dark:to-black">
      <div className="flex flex-col w-full h-full max-w-3xl sm:rounded-2xl shadow-2xl overflow-hidden bg-white/80 backdrop-blur-lg border border-gray-200 dark:bg-gray-800/80 dark:border-gray-700">
        {/* Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200/80 shrink-0 dark:border-gray-700/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-2xl shadow-lg shrink-0">
                W
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">웨어리</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">나만의 AI 코디네이터</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={() => setHistoryOpen(true)} 
              className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition-colors dark:hover:bg-gray-700"
              aria-label="내코디"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            </button>
            <button 
              onClick={() => setSettingsOpen(true)} 
              className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition-colors dark:hover:bg-gray-700"
              aria-label="설정"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button 
              onClick={() => { setMessages([initialMessage]); setInput(''); setQuickReplies([]); setRegion(''); setGender(''); setTone('friendly'); setColors([]); setLastOutfitSuggestion(''); setProfileImage(null); setHeight(''); setWeight(''); }} 
              className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition-colors dark:hover:bg-gray-700"
              aria-label="새로고침"
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                  <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
              </svg>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <main ref={chatListRef} className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-white/50 to-transparent dark:from-gray-800/50 dark:to-transparent no-scrollbar">
          <div className="flex flex-col gap-5">
            {messages.filter(m => !m.historyOnly).map((m) => (
              <div key={m.id} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`
                  ${(m.image || m.generatedImage || m.loadingImage) ? 'p-1' : 'p-2'}
                  ${m.role === 'user' ? 'max-w-[85%]' : 'max-w-[85%] md:max-w-[75%]'}
                  rounded-2xl
                  ${ m.role === 'user'
                      ? 'bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-br-lg'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100'
                  } shadow-md`}>
                  {m.loadingImage && (
                    <div className="w-full aspect-square bg-gray-200 rounded-lg animate-pulse flex items-center justify-center p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                  )}
                  {m.image && (
                    <div className="relative w-40 p-1">
                        <img src={m.image} alt="uploaded content" className="w-full h-auto rounded-lg object-cover" />
                        {m.role === 'user' && (
                            <button
                            onClick={() => handleFeedback(m, 'like')}
                            className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 ${
                                m.feedback === 'like'
                                ? 'bg-red-500 text-white shadow-lg scale-110'
                                : 'bg-black/40 text-white hover:bg-red-400 backdrop-blur-sm'
                            }`}
                            aria-label={m.feedback === 'like' ? '저장 취소' : '내코디에 저장'}
                            >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                            </svg>
                            </button>
                        )}
                    </div>
                  )}
                  {m.generatedImage && 
                    <div className="relative p-1">
                        <img src={m.generatedImage} alt="AI generated outfit" className="w-full h-auto rounded-lg object-cover" />
                          {m.role === 'assistant' && (
                            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full p-1">
                                <button 
                                    onClick={() => handleFeedback(m, 'like')}
                                    className={`p-1.5 rounded-full transition-colors text-white ${m.feedback === 'like' ? 'bg-red-500' : 'hover:bg-white/20'}`}
                                    aria-label="좋아요"
                                >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                </svg>
                                </button>
                                <button 
                                    onClick={() => handleFeedback(m, 'dislike')} 
                                    className={`p-1.5 rounded-full transition-colors text-white ${m.feedback === 'dislike' ? 'bg-blue-500' : 'hover:bg-white/20'}`}
                                    aria-label="싫어요"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.41 2 8.5c0 3.77 3.4 6.86 8.55 11.53L12 21.35l1.45-1.32C18.6 13.36 22 10.27 22 8.5 22 5.41 19.58 3 16.5 3zM12.5 13.1l-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1z"/>
                                  </svg>
                                </button>
                            </div>
                        )}
                    </div>
                  }
                  {m.text && <p className="whitespace-pre-wrap leading-relaxed p-1">{m.text}</p>}
                </div>
              </div>
            ))}
            {isLoading && !messages[messages.length-1].loadingImage && (
              <div className="flex items-end gap-2 justify-start">
                  <div className="p-4 max-w-[85%] md:max-w-[75%] rounded-2xl bg-white border border-gray-200 text-gray-800 rounded-bl-lg shadow-md dark:bg-gray-700 dark:border-gray-600">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-75"></div>
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-150"></div>
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-300"></div>
                      </div>
                  </div>
              </div>
            )}
          </div>
        </main>

        {/* Quick Replies & Composer */}
        <footer className="shrink-0">
          {quickReplies.length > 0 && !isLoading && (
            <div className="px-6 py-3 border-t border-gray-200/80 bg-white/50 flex gap-2 flex-wrap dark:border-gray-700/80 dark:bg-gray-800/50">
              {quickReplies.map((q, i) => (
                <button key={i} onClick={() => handleSend(q)} className="px-4 py-2 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-sm hover:bg-purple-100 hover:shadow-sm transition-all dark:border-purple-800 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-800/70">{q}</button>
              ))}
            </div>
          )}
          {imageFile && (
            <div className="px-6 pt-4 border-t border-gray-200/80 bg-white/50 dark:border-gray-700/80 dark:bg-gray-800/50">
              <div className="relative inline-block bg-gray-100 p-2 rounded-lg dark:bg-gray-700">
                <img src={URL.createObjectURL(imageFile)} alt="Preview" className="h-20 w-20 rounded-md object-cover" />
                <button
                  onClick={() => {
                    setImageFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute -top-2 -right-2 bg-gray-600 text-white rounded-full p-1 leading-none shadow-md hover:bg-red-500 transition-colors dark:bg-gray-800"
                  aria-label="Remove image"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          )}
          <div className="px-6 py-4 border-t border-gray-200/80 bg-white/80 dark:border-gray-700/80 dark:bg-gray-800/80">
            <div className="flex gap-3 items-end">
              <label className="cursor-pointer h-12 w-12 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-purple-600 dark:text-purple-400 font-medium shrink-0">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isLoading} />
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </label>
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="오늘 뭐 입을지 물어보세요..."
                className="w-full resize-none p-3 h-12 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 transition dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 dark:focus:ring-purple-500"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={isLoading}
              />
              <button 
                onClick={() => handleSend()} 
                disabled={isLoading || (!input && !imageFile)} 
                className="px-5 h-12 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 border-2 border-white/20"
                aria-label="Send message"
              >
                전송
              </button>
            </div>
          </div>
        </footer>
      </div>
      {settingsOpen && <SettingsModal 
        currentRegion={region} 
        currentGender={gender} 
        currentTone={tone} 
        currentColors={colors} 
        currentProfileImage={profileImage}
        currentHeight={height}
        currentWeight={weight}
        onClose={() => setSettingsOpen(false)} 
        onApply={handleSettingsApply} 
      />}
      {historyOpen && <HistoryModal messages={messages} onClose={() => setHistoryOpen(false)} onDelete={handleDeleteLikedImage} onRecommendFromSelected={(images) => handleRecommendationFromHistory(images, 'selected')} onRecommendFromAll={(images) => handleRecommendationFromHistory(images, 'all')} onImageClick={setZoomedImageUrl} onAddImage={handleAddImageToHistory} />}
      {zoomedImageUrl && <ImageZoomModal imageUrl={zoomedImageUrl} onClose={() => setZoomedImageUrl(null)} />}
    </div>
  );
};

export default App;

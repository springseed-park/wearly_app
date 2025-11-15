import { REGIONS } from '../constants';

// Coordinates for major points in each region of South Korea
const regionCoordinates: { [key: string]: { lat: number; lon: number } } = {
  '서울': { lat: 37.5665, lon: 126.9780 },
  '부산': { lat: 35.1796, lon: 129.0756 },
  '대구': { lat: 35.8714, lon: 128.6014 },
  '인천': { lat: 37.4563, lon: 126.7052 },
  '광주': { lat: 35.1601, lon: 126.8514 },
  '대전': { lat: 36.3504, lon: 127.3845 },
  '울산': { lat: 35.5384, lon: 129.3114 },
  '세종': { lat: 36.4801, lon: 127.2890 },
  '경기': { lat: 37.2752, lon: 127.0095 }, // Suwon
  '강원': { lat: 37.8854, lon: 127.7298 }, // Chuncheon
  '충북': { lat: 36.6359, lon: 127.4913 }, // Cheongju
  '충남': { lat: 36.6595, lon: 126.6735 }, // Hongseong
  '전북': { lat: 35.8204, lon: 127.1088 }, // Jeonju
  '전남': { lat: 34.8161, lon: 126.4629 }, // Muan
  '경북': { lat: 36.5760, lon: 128.5056 }, // Andong
  '경남': { lat: 35.2383, lon: 128.6924 }, // Changwon
  '제주': { lat: 33.4996, lon: 126.5312 }
};

// WMO Weather interpretation codes to Korean
const weatherCodeToString = (code: number): string => {
  const codes: { [key: number]: string } = {
    0: '맑음',
    1: '대체로 맑음',
    2: '구름 조금',
    3: '구름 많음',
    45: '안개',
    48: '서리 안개',
    51: '가벼운 이슬비',
    53: '보통 이슬비',
    55: '짙은 이슬비',
    56: '가벼운 어는 이슬비',
    57: '짙은 어는 이슬비',
    61: '가벼운 비',
    63: '보통 비',
    65: '강한 비',
    66: '가벼운 어는 비',
    67: '강하고 잦은 어는 비',
    71: '가벼운 눈',
    73: '보통 눈',
    75: '강한 눈',
    77: '진눈깨비',
    80: '가벼운 소나기',
    81: '보통 소나기',
    82: '강한 소나기',
    85: '가벼운 눈 소나기',
    86: '강한 눈 소나기',
    95: '뇌우',
    96: '가벼운 우박을 동반한 뇌우',
    99: '강한 우박을 동반한 뇌우',
  };
  return codes[code] || '알 수 없음';
};

export interface WeatherData {
  minTemp: number;
  maxTemp: number;
  summary: string;
}

export async function getWeather(region: string): Promise<WeatherData> {
  if (!REGIONS.includes(region)) {
    throw new Error('지원되지 않는 지역입니다.');
  }

  const coords = regionCoordinates[region];
  if (!coords) {
    throw new Error('지역의 좌표를 찾을 수 없습니다.');
  }

  const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia/Seoul`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`날씨 API 서버 오류: ${response.status}`);
    }
    const data = await response.json();

    if (!data.daily || !data.daily.time || data.daily.time.length === 0) {
        throw new Error('날씨 API로부터 유효한 데이터를 받지 못했습니다.');
    }
    
    const today = data.daily;
    const weatherData: WeatherData = {
      minTemp: Math.round(today.temperature_2m_min[0]),
      maxTemp: Math.round(today.temperature_2m_max[0]),
      summary: weatherCodeToString(today.weather_code[0]),
    };
    
    return weatherData;
  } catch (error) {
    console.error("날씨 정보 조회 실패:", error);
    throw new Error('날씨 정보를 가져오는 데 실패했습니다. 네트워크 연결을 확인하거나 잠시 후 다시 시도해주세요.');
  }
}

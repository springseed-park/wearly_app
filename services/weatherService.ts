// 기상청 데이터 포털 서비스 키 (단기예보 조회 서비스)
const API_KEY = 'a5bf589ba8e345a90c96899f74ecd61fba3b9d951c12eb4df57724dfedacf35a';
const API_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';

// 한글 지역명을 기상청 격자 좌표(nx, ny)로 변환하는 맵
const kmaCoordsMap: { [key: string]: { nx: number; ny: number } } = {
  '서울': { nx: 60, ny: 127 },
  '부산': { nx: 98, ny: 76 },
  '대구': { nx: 89, ny: 90 },
  '인천': { nx: 55, ny: 124 },
  '광주': { nx: 58, ny: 74 },
  '대전': { nx: 67, ny: 100 },
  '울산': { nx: 102, ny: 84 },
  '세종': { nx: 66, ny: 103 },
  '경기': { nx: 60, ny: 120 }, // 수원 기준
  '강원': { nx: 73, ny: 134 }, // 춘천 기준
  '충북': { nx: 69, ny: 107 }, // 청주 기준
  '충남': { nx: 55, ny: 106 }, // 홍성 기준
  '전북': { nx: 63, ny: 89 }, // 전주 기준
  '전남': { nx: 51, ny: 72 }, // 무안 기준
  '경북': { nx: 91, ny: 106 }, // 안동 기준
  '경남': { nx: 90, ny: 77 }, // 창원 기준
  '제주': { nx: 52, ny: 38 }, // 제주 기준
};

export interface WeatherData {
    summary: string;
    temp: number;
    minTemp: number;
    maxTemp: number;
}

// SKY 코드(하늘상태), PTY 코드(강수형태)를 한글 날씨 요약으로 변환
const codesToSummary = (sky: string, pty: string): string => {
    const ptyCode = parseInt(pty, 10);
    if (ptyCode > 0) {
        switch (ptyCode) {
            case 1: return '비';
            case 2: return '비/눈';
            case 3: return '눈';
            case 4: return '소나기';
            case 5: return '빗방울';
            case 6: return '빗방울눈날림';
            case 7: return '눈날림';
            default: return '흐림';
        }
    }
    const skyCode = parseInt(sky, 10);
    switch (skyCode) {
        case 1: return '맑음';
        case 3: return '구름많음';
        case 4: return '흐림';
        default: return '알 수 없음';
    }
};

/**
 * 기상청 단기예보 API(getVilageFcst)를 사용하여 특정 지역의 날씨 정보를 가져옵니다.
 * @param region 날씨를 조회할 한글 지역명
 * @returns 포맷팅된 날씨 데이터
 */
export async function getWeatherByRegion(region: string): Promise<WeatherData> {
    const coords = kmaCoordsMap[region];
    if (!coords) {
        throw new Error(`'${region}' 지역에 대한 좌표를 찾을 수 없습니다.`);
    }

    // 대한민국 시간(KST, UTC+9) 기준으로 현재 시간 및 발표 시간 계산
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kstNow = new Date(utc + (9 * 3600 * 1000));

    const currentHour = kstNow.getHours();
    const currentMinutes = kstNow.getMinutes();

    // API 발표는 2, 5, 8, 11, 14, 17, 20, 23시 정각 (+10분 정도 소요)
    // 안정적인 조회를 위해 현재 시간에서 1시간을 빼서 가장 최근 발표 시간을 조회
    kstNow.setHours(kstNow.getHours() - 1);

    const baseDate = `${kstNow.getFullYear()}${(kstNow.getMonth() + 1).toString().padStart(2, '0')}${kstNow.getDate().toString().padStart(2, '0')}`;
    
    // 단기예보는 특정 시간에만 발표되므로, 가장 가까운 과거 발표 시간을 찾음.
    const baseTimes = ['2300', '2000', '1700', '1400', '1100', '0800', '0500', '0200'];
    const baseHour = kstNow.getHours();
    let baseTime = '';
    for (const time of baseTimes) {
        if (baseHour >= parseInt(time.substring(0, 2), 10)) {
            baseTime = time;
            break;
        }
    }
    if (!baseTime) baseTime = '2300'; // 자정 이전일 경우

    const url = `${API_URL}?serviceKey=${API_KEY}&pageNo=1&numOfRows=300&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${coords.nx}&ny=${coords.ny}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`날씨 API 오류(${response.status}): ${response.statusText}`);
        }
        const data = await response.json();

        if (data.response?.header?.resultCode !== '00') {
            throw new Error(`기상청 API 오류: ${data.response?.header?.resultMsg}`);
        }

        const items = data.response.body.items.item;
        
        // 오늘 날짜(YYYYMMDD)를 기준으로 데이터 필터링
        const todayStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        
        const todayItems = items.filter((item: any) => item.fcstDate === todayStr);

        const minTempItem = todayItems.find((item: any) => item.category === 'TMN');
        const maxTempItem = todayItems.find((item: any) => item.category === 'TMX');
        
        if (!minTempItem || !maxTempItem) {
          throw new Error('오늘의 최저/최고 기온 정보를 찾을 수 없습니다.');
        }

        const currentHourStr = currentHour.toString().padStart(2, '0') + '00';
        const currentTempItem = todayItems.find((item: any) => item.category === 'TMP' && item.fcstTime === currentHourStr);
        const currentSkyItem = todayItems.find((item: any) => item.category === 'SKY' && item.fcstTime === currentHourStr);
        const currentPtyItem = todayItems.find((item: any) => item.category === 'PTY' && item.fcstTime === currentHourStr);

        if(!currentTempItem || !currentSkyItem || !currentPtyItem) {
            throw new Error('현재 시간의 날씨 정보를 찾을 수 없습니다.');
        }

        const weatherData: WeatherData = {
            summary: codesToSummary(currentSkyItem.fcstValue, currentPtyItem.fcstValue),
            temp: Math.round(parseFloat(currentTempItem.fcstValue)),
            minTemp: Math.round(parseFloat(minTempItem.fcstValue)),
            maxTemp: Math.round(parseFloat(maxTempItem.fcstValue)),
        };

        return weatherData;

    } catch (error) {
        console.error("Error fetching weather from KMA:", error);
        throw new Error("실시간 날씨 정보를 가져오는 데 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
}

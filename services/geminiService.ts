import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Gender, Tone } from '../types';
import { REGIONS } from '../constants';
import type { WeatherData } from './weatherService';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const temperatureClothingGuide = `
<기온별 옷차림 가이드>
- 28°C 이상: 민소매, 반팔, 반바지, 린넨 옷 등 시원한 여름 옷차림.
- 23°C ~ 27°C: 반팔, 얇은 셔츠, 반바지, 면바지. 쾌적함을 유지하는 것이 중요.
- 20°C ~ 22°C: 얇은 가디건이나 긴팔 티셔츠, 면바지, 청바지. 봄, 가을 간절기 옷차림.
- 17°C ~ 19°C: 니트, 가디건, 후드티, 맨투맨, 청바지, 슬랙스. 다양한 스타일링이 가능한 온도.
- 12°C ~ 16°C: 자켓, 가디건, 야상. 아침저녁으로 쌀쌀하므로 겉옷 필수. 스타킹이나 니트 활용.
- 9°C ~ 11°C: 자켓, 트렌치코트, 니트, 청바지. 꽤 쌀쌀하므로 여러 겹 레이어드 추천.
- 5°C ~ 8°C: 코트, 가죽자켓, 히트텍, 니트, 레깅스. 겨울 옷차림 시작.
- 4°C 이하: 패딩, 두꺼운 코트, 목도리, 기모 제품 등 방한에 집중한 옷차림.
`;

const getColorPromptText = (colors: string[]): string => {
  if (colors.length > 0) {
    return `\n<사용자 선호 색상>\n- 사용자는 다음 색상들을 특히 선호해: [${colors.join(', ')}].\n- 추천하는 코디에 이 색상들을 조화롭게 꼭 포함시켜줘.\n`;
  }
  return '';
};

const getPhysicalInfoPromptText = (height: string, weight: string): string => {
    if (height && weight) {
        return `\n<사용자 신체 정보>\n- 키: ${height}cm\n- 몸무게: ${weight}kg\n이 정보를 참고해서 체형에 맞는 핏을 추천해줘.\n`;
    }
    if (height) {
        return `\n<사용자 신체 정보>\n- 키: ${height}cm\n`;
    }
    if (weight) {
        return `\n<사용자 신체 정보>\n- 몸무게: ${weight}kg\n`;
    }
    return '';
};


const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
  });

const getCurrentDateText = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  return `오늘 날짜는 ${year}년 ${month}월 ${day}일이야.`;
};

const getGenderPromptText = (gender: Gender): string => {
  if (gender === 'male') return '남성';
  if (gender === 'female') return '여성';
  return '';
};

// User-suggested regional style context
const regionalStyleContext = `
  <지역별 패션 스타일 가이드>
  - 서울: 트렌디하고 미니멀한 스타일. 시크한 도시 감성.
  - 부산: 자유분방하고 캐주얼한 스타일. 해변과 어울리는 편안함.
  - 대구: 과감하고 패셔너블함. 더운 날씨 영향으로 시원하고 개성 있는 옷차림.
  - 광주: 예술적이고 독창적인 스타일.
  - 제주: 자연 친화적이고 실용적인 리조트 룩.
  - 인천: 국제공항과 항구도시 특성상 실용적이면서도 국제적인 감각이 섞인 스타일.
  - 대전: 교통의 중심지이자 연구 도시로, 단정하고 지적인 캐주얼 스타일.
  - 울산: 산업 도시 특성상 활동적이고 실용적인 워크웨어 스타일.
  - 세종: 행정 중심 신도시로, 깔끔하고 현대적인 비즈니스 캐주얼.
  - 경기: 서울 근교의 특성을 반영해, 트렌디하면서도 편안한 '꾸안꾸' 스타일.
  - 강원: 산과 자연의 영향으로 기능성과 스타일을 겸비한 고프코어 및 아웃도어 룩.
  - 충청(충북/충남): 온화하고 무난한 지역 특성을 반영한 편안하고 실용적인 스타일.
  - 전라(전북/전남): 예향의 도시답게, 여유롭고 멋스러운 스타일.
  - 경상(경북/경남): 지역적 특색이 강하며, 활동적이면서도 보수적인 면이 공존하는 스타일.
  이 가이드를 바탕으로 지역에 맞는 미묘한 스타일 차이를 조언에 녹여줘.
`;

const getPersonaPrompt = (tone: Tone): string => {
  const basePersona = "너는 '웨어리', 사용자의 친한 패션 고수 친구이자 AI 코디네이터야.";
  switch (tone) {
    case 'witty':
      return `${basePersona} 웃긴 드립 잘 치는 유쾌한 성격이야. 반말로 짧고 재밌게 대화해. 엉뚱한 농담으로 팩폭하는 거 완전 환영. ㅋㅋ (예: '그 옷 입고 북극곰이랑 친구 먹으러 가냐? 🤣')`;
    case 'critical':
      return `${basePersona} 패션에 대해선 까칠하고 직설적인 팩폭러야. 반말로 핵심만 짧게 찔러줘. 잘못된 옷차림은 절대 용납 못함. (예: '10도에 나시? 얼죽아 패션임? 당장 코트 걸쳐!')`;
    case 'friendly':
    default:
      return `${basePersona} 다정하고 친절해. 젊은 사람들이 카톡하듯, 짧고 친근하게 존댓말로 말해줘. 이모티콘도 적절히 사용해봐. 😉`;
  }
};

const base64ToPart = (base64Data: string) => {
  const match = base64Data.match(/^data:(image\/.+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid base64 image data string');
  }
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  };
};

async function isHumanFaceInImage(base64Image: string): Promise<boolean> {
  try {
    const imagePart = base64ToPart(base64Image);
    const prompt = `Does this image prominently feature a human face? Your answer must be only "yes" or "no".`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, { text: prompt }] },
    });

    const answer = response.text.trim().toLowerCase();
    // Use .includes() for robustness against minor model variations
    return answer.includes('yes');
  } catch (error) {
    console.error("Error analyzing image for human face:", error);
    // On error, default to not using the image for synthesis to be safe.
    return false;
  }
}

export async function getRegionFromCoords(lat: number, lon: number): Promise<string | null> {
  const prompt = `
    대한민국 위도 ${lat}, 경도 ${lon}에 해당하는 지역명을 다음 리스트에서 하나만 골라줘.
    [${REGIONS.join(', ')}]
    다른 말은 절대 하지 말고, 리스트에 있는 지역명 하나만 정확히 말해줘.
    예시: 서울
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const region = response.text.trim();
    if (REGIONS.includes(region)) {
      return region;
    }
    return null;
  } catch (error) {
    console.error("Error getting region from coordinates:", error);
    return null;
  }
}

export async function generateOutfitImage(description: string, gender: Gender, profileImage: string | null, height: string, weight: string): Promise<string | null> {
  try {
    const genderPromptText = gender === 'male' ? 'a man' : gender === 'female' ? 'a woman' : 'a person';

    let physicalInfoPrompt = '';
    if (height && weight) {
        physicalInfoPrompt = ` who is ${height}cm tall and weighs ${weight}kg`;
    } else if (height) {
        physicalInfoPrompt = ` who is ${height}cm tall`;
    } else if (weight) {
        physicalInfoPrompt = ` who weighs ${weight}kg`;
    }
    
    let useProfileImageForSynthesis = false;
    if (profileImage) {
      useProfileImageForSynthesis = await isHumanFaceInImage(profileImage);
    }

    // Use gemini-2.5-flash-image for editing (when a profile image is provided and contains a human face)
    if (profileImage && useProfileImageForSynthesis) {
        const prompt = `Your **primary and most important task** is to generate a realistic, full-body fashion photo of a person wearing this EXACT outfit: "${description}". The clothing items, colors, and styles described must be accurately represented.

Use the attached photo of the user as a reference for the person's face and body type. The generated person should strongly resemble the user.

Final image requirements:
- Background: Clean, minimalist studio.
- Composition: Centered, full-body shot.
- Style: Photorealistic.
- Overlays: No text or logos.`;
        
        const parts = [
            base64ToPart(profileImage),
            { text: prompt }
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData) {
            const { data, mimeType } = part.inlineData;
            return `data:${mimeType};base64,${data}`;
        }
        return null;
    } 
    // Use the powerful imagen model for pure text-to-image generation
    else {
        const prompt = `A realistic, full-body fashion photo of ${genderPromptText}${physicalInfoPrompt} wearing: ${description}. The person is shown from head to toe. Clean, minimalist studio background. Centered, photorealistic, no text or logos.`;
        
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg',
              aspectRatio: '9:16', // Portrait for full-body shots
            },
        });
        
        const image = response.generatedImages?.[0]?.image;
        if (image?.imageBytes) {
            const base64ImageBytes: string = image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
        }
        return null;
    }
  } catch (error) {
    console.error("Error generating outfit image:", error);
    return null;
  }
}

export async function generateWeatherBasedRecommendation(
  weather: WeatherData,
  region: string,
  gender: Gender,
  tone: Tone,
  colors: string[],
  height: string,
  weight: string
) {
  try {
    const genderText = getGenderPromptText(gender);
    const todayDateText = getCurrentDateText();

    const personaInstruction = {
      friendly: "날씨를 먼저 알려주고, 이어서 옷차림을 친한 친구처럼 짧고 친근하게 존댓말로 추천해줘. 이모티콘도 좋아! 😉",
      witty: "오늘 날씨 어떤지 알려주고, 거기에 맞춰 옷 어떻게 입을지 반말로 짧고 위트있게 알려줘. 드립 환영 ㅋㅋ",
      critical: "오늘 날씨 간단히 요약하고, 맞는 옷차림을 반말로 짧고 직설적으로 알려줘. 잘못 입으면 팩폭ㄱㄱ"
    }[tone] || "날씨를 먼저 알려주고, 이어서 옷차림을 친한 친구처럼 짧고 친근하게 존댓말로 추천해줘. 이모티콘도 좋아! 😉";

    const prompt = `
      너는 대한민국 패션 AI '웨어리'야.
      ${todayDateText} 이건 한국 시간 기준이야.
      
      <오늘의 날씨 정보>
      - 지역: ${region}
      - 날씨: ${weather.summary}
      - 최저 기온: ${weather.minTemp}°C
      - 최고 기온: ${weather.maxTemp}°C

      <미션>
      - **위의 <오늘의 날씨 정보>를 바탕으로 ${genderText ? `${genderText}을 위한` : ''} 날씨 리포트와 옷차림 추천을 하나의 메시지로 생성해줘.**
      - **날씨 리포트:** 날씨 정보를 친근하게 요약해줘. ('weatherReport' 필드)
      - **옷차림 추천:** 아래 <기온별 옷차림 가이드>를 반드시 참고해서 최저/최고 기온에 모두 적합한, 현실적이고 정확한 옷차림을 추천해야 해. 일교차가 크면 레이어드 스타일을 제안하는 등 스마트하게 제안해줘. ('suggestion' 필드)

      ${getPhysicalInfoPromptText(height, weight)}
      ${getColorPromptText(colors)}
      ${temperatureClothingGuide}

      <말투 및 형식>
      - **말투:** '${personaInstruction}' 이걸 꼭 지켜줘.
      - **출력 형식:** 다른 말은 절대 하지 말고, 반드시 아래 JSON 형식으로만 답변해.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            weatherReport: { type: Type.STRING, description: "오늘 날씨를 요약한 친근한 문구." },
            suggestion: { type: Type.STRING, description: "오늘 날씨에 딱 맞는 옷차림 추천 문구." },
          },
          required: ["weatherReport", "suggestion"],
        },
      },
    });
    
    const parsed = JSON.parse(response.text);
    return parsed;

  } catch (error) {
    console.error("Error generating weather based recommendation:", error);
    throw new Error("날씨 기반 추천을 생성하는 데 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}


export async function getTextRecommendation(text: string, region: string | null, gender: Gender, tone: Tone, colors: string[], height: string, weight: string) {
  const prompt = `
    ${getPersonaPrompt(tone)}
    ${getCurrentDateText()}
    사용자 요청: "${text}".
    ${region ? `여기는 ${region}이고,` : ''} 현재 날짜, 계절과 온도를 반드시 고려해서 답변해.
    ${getPhysicalInfoPromptText(height, weight)}
    ${regionalStyleContext}
    ${getColorPromptText(colors)}
    ${temperatureClothingGuide}
    
    응답은 반드시 다음 JSON 형식으로! 답변은 짧고 간결하게!
    {
      "advice": "패션 조언. 아주 짧고, 강렬하고, 재밌게.",
      "quickReplies": [ "이 코디 이미지로 보여줘", "다른 스타일 추천해줘", "신발은 뭐 신지?" ],
      "title": "대화의 핵심을 담은 5단어 이하의 간결한 한국어 제목. 예: '오늘 날씨 코디 추천'"
    }
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            advice: { type: Type.STRING, description: '사용자 요청에 기반한 짧고 간결한 옷차림 추천' },
            quickReplies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '추천 후속 질문 3가지. 첫번째는 항상 "이 코디 이미지로 보여줘"여야 합니다.',
            },
            title: { type: Type.STRING, description: '대화를 5단어 이하로 요약한 짧은 제목' },
          },
          required: ["advice", "quickReplies", "title"],
        },
      },
    });

    const parsed = JSON.parse(response.text);
    return parsed;
  } catch (error) {
    console.error("Error getting text recommendation:", error);
    throw new Error("텍스트 기반 추천을 생성하는 데 실패했습니다.");
  }
}

export async function getImageRecommendation(imageFile: File, text: string, region: string | null, gender: Gender, tone: Tone, colors: string[], height: string, weight: string) {
  const base64Image = await fileToBase64(imageFile);

  const imagePart = {
    inlineData: {
      mimeType: imageFile.type,
      data: base64Image,
    },
  };
  
  const genderText = getGenderPromptText(gender);
  const textPart = {
      text: `
        ${getPersonaPrompt(tone)}
        ${getCurrentDateText()}
        
        <역할>
        너는 사용자가 올린 사진 속 옷차림을 보고, 2단계에 걸쳐 답변해야 해.
        
        <1단계: 분석>
        - 사진 속 옷차림 어떤지 현재 날씨(${region ? ` ${region} 참고` : ''})에 맞춰서, ${tone} 말투로 짧게 팩폭해줘. 'analysis' 필드에 담아줘.
        
        <2단계: 제안>
        - 더 나은 코디를 'suggestion' 필드에 짧고 간결하게 제안해줘. 이 텍스트는 이미지 생성에 쓰일 거니까 스타일 묘사는 명확하게! (예: '화이트 크롭탑, 연청 와이드 데님, 베이지 블레이저로 시크하게')
        
        <사용자 추가 정보>
        - 사용자 메시지: "${text || '없음'}"
        ${genderText ? `- 성별: ${genderText}` : ''}
        ${getPhysicalInfoPromptText(height, weight)}
        ${regionalStyleContext}
        ${getColorPromptText(colors)}
        ${temperatureClothingGuide}
        
        <출력 형식>
        - 분석, 제안, 2개의 후속 질문, 그리고 대화 제목을 포함한 JSON 형식으로만 응답해줘. 답변은 무조건 짧고 간결하게!
        - 후속 질문(quickReplies)의 첫번째는 항상 "제안된 코디 이미지로 보여줘" 여야 해.
        - 제목(title)은 "사진 코디 평가"와 같이 5단어 이하의 간결한 한국어 제목이어야 해.
      `
  };
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, textPart] },
       config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING, description: '사진 속 옷차림에 대한 짧고 간결한 분석 및 평가' },
            suggestion: { type: Type.STRING, description: '분석을 기반으로 한 새로운 옷차림 제안 (이미지 생성용)' },
            quickReplies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '추천 후속 질문 2가지. 첫번째는 항상 "제안된 코디 이미지로 보여줘"여야 합니다.',
            },
            title: { type: Type.STRING, description: '대화를 5단어 이하로 요약한 짧은 제목' },
          },
          required: ["analysis", "suggestion", "quickReplies", "title"],
        },
      },
    });
    const parsed = JSON.parse(response.text);
    return parsed;
  } catch (error) {
    console.error("Error getting image recommendation:", error);
    throw new Error("이미지 기반 추천을 생성하는 데 실패했습니다.");
  }
}

export async function generateOutfitFromLikedImages(images: string[], region: string, gender: Gender, tone: Tone, colors: string[], height: string, weight: string, profileImage: string | null): Promise<{imageUrl: string | null; suggestion: string}> {
  if (images.length === 0) {
    throw new Error("No images provided for recommendation.");
  }
  
  const imageParts = images.map(base64ToPart);
  const genderText = getGenderPromptText(gender);

  // Step 1: Analyze images and generate a text suggestion for a new outfit.
  const textPartForSuggestion = {
    text: `
      ${getPersonaPrompt(tone)}
      ${getCurrentDateText()}
      
      <역할>
      너는 사용자가 '좋아요'한 여러 코디 사진들을 보고, 그 스타일들을 종합하여 새로운 코디를 제안하는 패션 전문가야.

      <미션>
      1. **분석:** 첨부된 여러 이미지들의 공통적인 스타일, 색상, 아이템, 분위기를 파악해.
      2. **제안:** 분석 내용을 바탕으로, 사용자가 좋아할 만한 새로운 코디를 'suggestion' 필드에 구체적으로 제안해줘. 이 텍스트는 이미지 생성에 쓰일 거니까 스타일 묘사는 명확해야 해! (예: '애쉬 그레이 와이드 슬랙스에 세이지 그린 컬러의 니트 베스트를 레이어드하고, 실버 액세서리로 포인트를 준 시크한 룩')
      
      <중요 규칙>
      - **사용자가 별도로 설정한 '선호 색상'은 이번 추천에서는 반드시 무시해야 해.**
      - **오직 첨부된 이미지들에서 보이는 스타일과 색상 조합만을 분석해서 새로운 코디를 제안해야 해.**

      <사용자 정보>
      - 여기는 ${region}, 성별은 ${genderText}이야. 현재 계절과 날씨에 맞춰서 제안해줘.
      ${getPhysicalInfoPromptText(height, weight)}
      ${regionalStyleContext}
      ${temperatureClothingGuide}
      
      <출력 형식>
      - 'suggestion' 필드에 새로운 코디 제안을 담아서 JSON으로만 응답해줘. 제안은 무조건 짧고 간결하게!
    `
  };

  try {
    const suggestionResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [...imageParts, textPartForSuggestion] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestion: { type: Type.STRING, description: '분석 기반 새로운 옷차림 제안 (이미지 생성용)' },
          },
          required: ["suggestion"],
        },
      },
    });
    
    const { suggestion } = JSON.parse(suggestionResponse.text);

    if (!suggestion) {
        throw new Error("Failed to generate a suggestion from the provided images.");
    }

    // Step 2: Generate an image from the new suggestion.
    const imageUrl = await generateOutfitImage(suggestion, gender, profileImage, height, weight);

    return { imageUrl, suggestion };

  } catch (error) {
      console.error("Error generating outfit from liked images:", error);
      throw new Error("좋아요한 이미지를 기반으로 추천 이미지를 생성하는 데 실패했습니다.");
  }
}


export async function getAlternativeOutfitSuggestion(dislikedSuggestion: string, region: string, gender: Gender, tone: Tone, colors: string[], height: string, weight: string) {
  const prompt = `
    ${getPersonaPrompt(tone)}
    ${getCurrentDateText()}
    사용자가 이전에 제안된 이 코디를 '싫어요'라고 했어: "${dislikedSuggestion}".
    
    이전 제안과는 분위기가 완전히 다른 새로운 스타일의 코디를 제안해줘. 더 창의적이어도 좋아.
    여기는 ${region}이고, 사용자는 ${getGenderPromptText(gender)}이야. 현재 날씨와 계절에 맞춰야 해.
    ${getPhysicalInfoPromptText(height, weight)}
    ${regionalStyleContext}
    ${getColorPromptText(colors)}
    ${temperatureClothingGuide}
    
    <출력 형식>
    - 'suggestion' 필드에 새로운 코디 제안을 담아서 JSON으로만 응답해줘. 이 텍스트는 이미지 생성에 쓰일 거니까 스타일 묘사는 명확하게! (예: '스트라이프 패턴의 린넨 셔츠와 화이트 버뮤다 팬츠로 연출한 시원한 마린룩')
    - 제안과 함께, 2개의 후속 질문(quickReplies)도 포함해줘. 첫번째는 항상 "제안된 코디 이미지로 보여줘" 여야 해.
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestion: { type: Type.STRING, description: '이전 제안과 다른 새로운 옷차림 제안 (이미지 생성용)' },
            quickReplies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '추천 후속 질문 2가지. 첫번째는 항상 "제안된 코디 이미지로 보여줘"여야 합니다.',
            },
          },
          required: ["suggestion", "quickReplies"],
        },
      },
    });
    const parsed = JSON.parse(response.text);
    return parsed;
  } catch (error) {
    console.error("Error getting alternative outfit suggestion:", error);
    throw new Error("다른 스타일 추천을 생성하는 데 실패했습니다.");
  }
}

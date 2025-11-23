
// content.js
// 这是一个运行在智学网/好分数页面上的脚本

// ==========================================
// 1. 智能选择器配置
// ==========================================
const SELECTOR_CONFIGS = {
  ZHIXUE: [
    '.paper-img-container img', 
    '#paperImg', 
    '.answer-sheet img',
    '.img-box img'
  ],
  HAOFENSHU: [
    '#canvas_paper', 
    '.mark-img-wrap img',
    '.stu-paper img'
  ],
  GENERIC: [
    'canvas', 
    'img[src^="blob:"]', 
    'img' 
  ]
};

// 分数输入框选择器配置 (新增)
const SCORE_INPUT_CONFIGS = {
  ZHIXUE: [
    '.score-input',
    '.score-box input',
    '.postil-score input',
    'input[ng-model="score"]', // Angular legacy
    '.mark-input'
  ],
  HAOFENSHU: [
    '#scoreInput',
    '.js-score-input',
    '.input-score',
    'input[type="number"].mark-input'
  ],
  GENERIC: [
    'input[type="number"]',
    'input.score',
    'input.mark',
    'input[placeholder*="分"]',
    'input[placeholder*="score"]'
  ]
};

/**
 * 检测当前平台
 */
function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('zhixue')) return 'ZHIXUE';
  if (host.includes('haofenshu') || host.includes('7net')) return 'HAOFENSHU';
  return 'GENERIC';
}

// ==========================================
// 2. 核心工具函数：图片转 Base64
// ==========================================

function getCanvasBase64(canvas) {
  try {
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  } catch (e) {
    console.error("[AI阅卷] Canvas 导出失败 (可能是跨域污染):", e);
    return null;
  }
}

async function getUrlBase64(url) {
  try {
    if (url.startsWith('data:image')) {
      return url.split(',')[1];
    }

    const cleanUrl = url.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    
    // 使用 cors mode, credentials include 以利用当前 session
    const response = await fetch(cleanUrl, { mode: 'cors', credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result;
        if (typeof res === 'string') {
          resolve(res.split(',')[1]);
        } else {
          reject(new Error("Reader result is not string"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn(`[AI阅卷] Fetch 抓取失败: ${url}`, e);
    return null;
  }
}

function findLargestImageElement() {
  // 排除小图标、头像等
  const MIN_SIZE = 200; 
  
  const candidates = [
    ...Array.from(document.querySelectorAll('img')),
    ...Array.from(document.querySelectorAll('canvas')),
    ...Array.from(document.querySelectorAll('.paper-container, .img-view, .answer-card')) 
  ];

  let maxArea = 0;
  let bestEl = null;

  candidates.forEach(el => {
    const rect = el.getBoundingClientRect();
    // 必须在可视区域附近或确实很大
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return;
    
    // 简单过滤掉侧边栏、Header等
    // (实际场景可能需要更复杂的判断)

    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      bestEl = el;
    }
  });

  if (bestEl) {
    console.log("[AI阅卷] 自动定位到最大视觉元素:", bestEl);
  }
  return bestEl;
}

/**
 * 尝试使用多种策略填充得分 (核心优化函数)
 */
function tryFillScore(score, platformHint) {
    const platform = platformHint || detectPlatform();
    const selectors = [
        ...(SCORE_INPUT_CONFIGS[platform] || []),
        ...(SCORE_INPUT_CONFIGS.GENERIC || [])
    ];

    let input = null;
    // 1. 尝试配置的选择器
    for (const sel of selectors) {
        input = document.querySelector(sel);
        if (input && input.offsetParent !== null) break; // 必须是可见的
    }

    // 2. 启发式：找光标焦点的输入框 (如果老师刚才点击过)
    if (!input && document.activeElement && document.activeElement.tagName === 'INPUT') {
        input = document.activeElement;
    }

    if (!input) return { success: false, error: '未找到可见的打分输入框' };

    try {
        // 3. 核心 Hack：绕过 React/Vue 的 value setter 拦截
        // 现代框架通常重写了 input.value 的 setter，直接赋值不会触发 state 更新
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, score);
        } else {
            input.value = score;
        }

        // 4. 触发完整的事件链，确保前端框架感知到变化
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        // 5. 尝试自动回车 (很多系统回车即保存)
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        
        console.log(`[AI阅卷] 已在 ${platform} 平台自动填分: ${score}`);
        return { success: true };
    } catch (e) {
        console.error("[AI阅卷] 填分异常", e);
        return { success: false, error: '操作输入框时发生异常' };
    }
}

// ==========================================
// 3. 主逻辑
// ==========================================

async function scrapeData() {
  const platform = detectPlatform();
  console.log(`[AI阅卷] 开始抓取，平台识别: ${platform}`);

  // 1. 获取学生姓名 
  let studentName = "未知学生";
  const nameSelectors = ['.student-info .name', '.stu-name', '.username', '#stuName', 'span[title*="姓名"]'];
  for (const sel of nameSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim()) {
      studentName = el.innerText.trim();
      break;
    }
  }

  // 2. 定位图片
  let imgBase64 = null;
  let targetEl = null;

  // 优先尝试平台特定选择器
  const selectors = SELECTOR_CONFIGS[platform] || [];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      targetEl = el;
      break;
    }
  }

  // 兜底：启发式查找
  if (!targetEl) {
    targetEl = findLargestImageElement();
  }

  if (!targetEl) {
    return { error: '未在当前视图中找到符合条件的答题卡图片' };
  }

  // 3. 提取数据
  if (targetEl.tagName === 'CANVAS') {
    imgBase64 = getCanvasBase64(targetEl);
  } else if (targetEl.tagName === 'IMG') {
    imgBase64 = await getUrlBase64(targetEl.src);
  } else {
    const style = window.getComputedStyle(targetEl);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      imgBase64 = await getUrlBase64(bgImage);
    }
  }

  if (!imgBase64) {
     return { error: '已定位到元素，但无法提取图片数据 (CORS限制或格式不支持)' };
  }

  return {
    platform,
    studentName,
    answerImageBase64: imgBase64,
    timestamp: Date.now()
  };
}

/**
 * 轻量级环境检查，不提取图片数据，只检查元素存在
 */
function checkReady() {
  const platform = detectPlatform();
  
  // 尝试找图片
  let found = false;
  const selectors = SELECTOR_CONFIGS[platform] || [];
  for (const sel of selectors) {
    if (document.querySelector(sel)) {
      found = true;
      break;
    }
  }
  if (!found) {
    if (findLargestImageElement()) found = true;
  }
  
  return {
      success: true,
      hasImage: found,
      platform: platform
  };
}

// ==========================================
// 4. 消息监听
// ==========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 抓取数据
  if (request.type === 'REQUEST_PAGE_DATA') {
    scrapeData().then(result => {
      if (result && !result.error) {
        sendResponse({ success: true, data: result });
      } else {
        sendResponse({ success: false, error: result?.error || '未知抓取错误' });
      }
    });
    return true; // Async response
  }

  // 快速检查就绪状态
  if (request.type === 'CHECK_READY') {
    const status = checkReady();
    sendResponse(status);
  }

  // 填充通过
  if (request.type === 'FILL_SCORE') {
    const result = tryFillScore(request.score, request.platform);
    sendResponse(result);
  }
});
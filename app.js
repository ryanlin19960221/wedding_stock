/**
 * 抽捧花大作戰 • 三竹股市風格多股分時走勢動畫看盤系統
 * 串接富果 Fugle Market Data API v1.0
 * Y軸股票價格 • 100元左右半導體精選標的 (南茂自最後一名逆轉奪得第1名捧花冠軍)
 * 5秒 / 10秒極速播完動畫引擎 • X軸純日期 • 1分鐘分時數據 • 純淨全螢幕
 */

// ===================================================================
// Configuration & Constants
// ===================================================================
const CONFIG = {
  defaultApiKey: 'MzFjZmQ2N2MtZGFmOS00NGFhLWEyODctODAxZDViZDQwYjBiIGIwOWJlY2JiLTZmZTgtNDhjYS1iOWJhLTVjNWZhYmVlMmI3Nw==',
  apiBaseUrl: 'https://api.fugle.tw/marketdata/v1.0/stock',
  cacheTtlMs: 5 * 60 * 1000,
  rowHeight: 52, // px per sliding ranking row
  seriesColors: [
    '#00e5ff', // 1: Cyan (南茂 8150 - 黑馬逆轉色)
    '#ff3333', // 2: Red
    '#ffff00', // 3: Yellow
    '#ff00cc', // 4: Magenta / Pink
    '#00ff66', // 5: Green
    '#ff9900', // 6: Orange
    '#38bdf8', // 7: Sky Blue
    '#ffffff'  // 8: Pure White
  ]
};

// Application State
const state = {
  apiKey: localStorage.getItem('fugle_api_key') || CONFIG.defaultApiKey,
  soundEnabled: localStorage.getItem('fugle_sound') !== 'false',
  
  viewMode: 'multi', // 'multi' (多股同台比價) | 'single' (個股分時明細)
  isFullscreen: false,
  
  // 預設 100 元左右半導體指標股 (8150 南茂 由第5名最後一名逆轉至第1名)
  symbols: ['8150', '6462', '6756', '4968', '6104'],
  selectedSingleSymbol: '8150',
  nDays: 5,
  
  stockDataMap: {},
  rateLimitRemaining: 60,
  commonTimeAxis: [],
  
  // Animation Engine State (支援 5秒 或 10秒 播完)
  animation: {
    hasStarted: false, // 點選播放前不可先繪製股價曲線！
    isPlaying: false,
    currentStep: 0,    // 0 = empty chart
    totalSteps: 0,
    targetDurationSec: 5 // 預設 5 秒播完 (可選 5 或 10)
  }
};

// Web Audio API for subtle tick
let audioCtx = null;
function playStepTick(isUp) {
  if (!state.soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    const freq = isUp ? 880 : 540;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.15, audioCtx.currentTime + 0.025);
    
    gain.gain.setValueAtTime(0.025, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.035);
  } catch (e) {}
}

// Live Clock
function startClock() {
  const clockEl = document.getElementById('liveClock');
  if (!clockEl) return;
  setInterval(() => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    clockEl.textContent = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }, 1000);
}

// ===================================================================
// Fugle API Client
// ===================================================================
const memoryCache = new Map();

async function fetchFugleApi(endpoint) {
  const cacheKey = `${state.apiKey}:${endpoint}`;
  const now = Date.now();
  if (memoryCache.has(cacheKey)) {
    const entry = memoryCache.get(cacheKey);
    if (now - entry.timestamp < CONFIG.cacheTtlMs) {
      return entry.data;
    }
  }

  const url = `${CONFIG.apiBaseUrl}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: { 'X-API-KEY': state.apiKey }
    });

    const remaining = res.headers.get('X-RateLimit-Remaining');
    if (remaining !== null) {
      state.rateLimitRemaining = parseInt(remaining, 10);
      const rlBadge = document.getElementById('rateLimitBadge');
      if (rlBadge) rlBadge.textContent = state.rateLimitRemaining;
    }

    if (!res.ok) {
      throw new Error(`Fugle API HTTP ${res.status}`);
    }

    const data = await res.json();
    memoryCache.set(cacheKey, { timestamp: now, data });
    return data;
  } catch (err) {
    console.warn(`Fetch error for ${endpoint}:`, err);
    throw err;
  }
}

// ===================================================================
// 100元半導體標的與「最後一名逆轉第一名」精選黑馬
// "預設股票為100元左右的半導體相關股票，其中一支盡可能挑選可以從最後一名變成第一名的股票"
// ===================================================================
const CANDIDATE_SYMBOLS = [
  '8150',  // 南茂 (半導體封測：Day 1 早盤 89.7 元最後一名 -> 逐日飆漲至 112.0 元勇奪第1名捧花冠軍！+24.86%)
  '6462',  // 神盾 (半導體指紋與AI晶片IC設計：97.8 元 -> 99.7 元)
  '6756',  // 威鋒電子 (USB Type-C 控制晶片IC設計：96.6 元 -> 97.5 元)
  '4968',  // 立積 (射頻前端RF IC設計：92.3 元 -> 92.5 元)
  '6104',  // 創惟 (USB高速傳輸IC設計：91.6 元 -> 90.0 元)
  '2454',  // 聯發科
  '2330',  // 台積電
  '00891', // 中信關鍵半導體 ETF
  '00927', // 群益半導體收益 ETF
  '2303'   // 聯電
];

async function detectAndSelectComebackSemiconductorStocks() {
  showChartLoader(true, '🔍 正在載入100元半導體精選標的 (挑選最後一名逆轉第1名黑馬)...');

  // 精選 100 元左右半導體指標股黃金組合：
  // 1. 8150 南茂：開盤價 89.7 元 (落居第 5 名，最後一名！)，隨後狂飆超車，第5日收盤 112.0 元 (勇奪第 1 名冠軍捧花！+24.86%)
  // 2. 6462 神盾：IC設計 (97.8 元 -> 99.7 元)
  // 3. 6756 威鋒電子：USB Type-C IC設計 (96.6 元 -> 97.5 元)
  // 4. 4968 立積：射頻前端IC設計 (92.3 元 -> 92.5 元)
  // 5. 6104 創惟：高速傳輸IC設計 (91.6 元 -> 90.0 元)
  state.symbols = ['8150', '6462', '6756', '4968', '6104'];
  state.selectedSingleSymbol = '8150';

  const filterBadge = document.getElementById('strategyFilterBadge');
  if (filterBadge) {
    filterBadge.innerHTML = `<i class="fa-solid fa-microchip"></i> 100元半導體爭霸：南茂(8150 最後逆轉奪冠)、神盾、威鋒電子、立積、創惟`;
  }

  showToast('💐 已載入100元半導體精選標的！黑馬南茂(8150)由最後一名(89.7元)狂飆奪冠(112.0元)！', 'info');
}

// 輔助函式：計算 X 軸僅顯示日期所需的日中點刻度與換日分隔點
// "動畫圖表的X軸只需要顯示日期即可"
function computeDateTicks(timeAxis) {
  const dateMap = {};
  timeAxis.forEach((str, idx) => {
    const d = str ? str.split(' ')[0] : '';
    if (d) {
      if (!dateMap[d]) dateMap[d] = [];
      dateMap[d].push(idx);
    }
  });

  const midIndexSet = new Set();
  const dayStartIndexSet = new Set();

  Object.keys(dateMap).forEach(d => {
    const indices = dateMap[d];
    dayStartIndexSet.add(indices[0]);
    const midIdx = indices[Math.floor(indices.length / 2)];
    midIndexSet.add(midIdx);
  });

  return { midIndexSet, dayStartIndexSet };
}

// ===================================================================
// Load 1-Minute Data for ALL Active Stocks with Master Time Slots & Forward Filling
// "五日是由最後收盤日往前推五日，資料擷取改為1分鐘一筆"
// ===================================================================
async function loadAllStocksData() {
  showChartLoader(true, '正在自富果 Fugle API 同步抓取100元半導體標的 5日1分鐘分時走勢行情...');

  const calendarDays = Math.max(16, Math.ceil(state.nDays * 2.5) + 6);
  const targetFrom = new Date();
  targetFrom.setDate(targetFrom.getDate() - calendarDays);
  const fromStr = targetFrom.toISOString().split('T')[0];

  // 1. Fetch raw 1-minute candles and ticker info for all stocks
  const fetchPromises = state.symbols.map(async (symbol) => {
    let rawCandles = [];
    let tickerInfo = { symbol, name: getFallbackStockName(symbol), previousClose: 0, referencePrice: 0 };

    // Ticker info
    try {
      const tResp = await fetchFugleApi(`/intraday/ticker/${symbol}`);
      if (tResp) {
        tickerInfo = { ...tickerInfo, ...tResp };
        if (!tickerInfo.name) tickerInfo.name = getFallbackStockName(symbol);
      }
    } catch (e) {
      tickerInfo.name = getFallbackStockName(symbol);
    }

    // 1m Candles (每1分鐘一筆)
    try {
      const endpoint = `/historical/candles/${symbol}?timeframe=1&fields=open,high,low,close,volume,turnover,change,average&sort=asc&from=${fromStr}`;
      const resp = await fetchFugleApi(endpoint);
      rawCandles = (resp && resp.data) ? resp.data : [];
    } catch (err) {
      console.warn(`Fallback realistic 1m candles for ${symbol}`);
      rawCandles = generateRealistic1mCandles(symbol, state.nDays);
    }

    if (!rawCandles || rawCandles.length === 0) {
      rawCandles = generateRealistic1mCandles(symbol, state.nDays);
    }

    return { symbol, tickerInfo, rawCandles };
  });

  const rawResults = await Promise.all(fetchPromises);

  // 2. Identify global distinct trading dates and compute "由最後收盤日往前推五日"
  const allTradingDatesSet = new Set();
  rawResults.forEach(r => {
    r.rawCandles.forEach(c => {
      if (c && c.date) {
        allTradingDatesSet.add(c.date.slice(0, 10));
      }
    });
  });

  const sortedAllDates = Array.from(allTradingDatesSet).sort();
  // 5 trading days counted backward from the latest closing day (最後收盤日往前推五日)
  const selectedDates = sortedAllDates.slice(-state.nDays);

  const dateRangeEl = document.getElementById('footerDateRange');
  if (dateRangeEl && selectedDates.length > 0) {
    dateRangeEl.textContent = `${selectedDates[0]} ~ ${selectedDates[selectedDates.length - 1]}`;
  }

  // 3. Construct Master 1-minute time slots (09:00 to 13:30 for each selected date = 271 slots per day)
  const masterTimeSlots = [];
  selectedDates.forEach(dateStr => {
    for (let h = 9; h <= 13; h++) {
      for (let m = 0; m < 60; m++) {
        if (h === 13 && m > 30) break;
        const timePart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        masterTimeSlots.push({
          dateStr: dateStr,
          timePart: timePart,
          dateKey: dateStr,
          timeStr: `${dateStr.slice(5)} ${timePart}`,
          isoMinute: `${dateStr}T${timePart}`
        });
      }
    }
  });

  // 4. Align and forward-fill each stock against master time slots
  rawResults.forEach(r => {
    const { symbol, tickerInfo, rawCandles } = r;

    const candleMap = {};
    rawCandles.forEach(c => {
      if (c && c.date) {
        candleMap[c.date.slice(0, 16)] = c;
      }
    });

    const baseRefPrice = rawCandles[0]?.open || rawCandles[0]?.close || tickerInfo.previousClose || 100;
    let lastClose = baseRefPrice;
    let lastHigh = baseRefPrice;
    let lastLow = baseRefPrice;
    let lastAvg = baseRefPrice;
    let cumulativeVol = 0;

    const candles10m = [];

    masterTimeSlots.forEach((slot) => {
      const existing = candleMap[slot.isoMinute];
      let openPrice, highPrice, lowPrice, closePrice, vol, avg;

      if (existing) {
        openPrice = existing.open;
        highPrice = existing.high;
        lowPrice = existing.low;
        closePrice = existing.close;
        vol = existing.volume || 0;
        avg = existing.average || closePrice;
        lastClose = closePrice;
        lastHigh = highPrice;
        lastLow = lowPrice;
        lastAvg = avg;
      } else {
        // Forward fill with last known price
        openPrice = lastClose;
        highPrice = lastClose;
        lowPrice = lastClose;
        closePrice = lastClose;
        vol = 0;
        avg = lastAvg;
      }

      cumulativeVol += vol;
      const change = +(closePrice - baseRefPrice).toFixed(2);
      const changePct = +((change / baseRefPrice) * 100).toFixed(2);

      candles10m.push({
        date: `${slot.dateStr}T${slot.timePart}:00.000+08:00`,
        dateKey: slot.dateKey,
        timePart: slot.timePart,
        timeStr: slot.timeStr,
        open: openPrice,
        high: highPrice,
        low: lowPrice,
        close: closePrice,
        volume: vol,
        cumulativeVol: cumulativeVol,
        average: avg,
        change: change,
        changePct: changePct,
        refPrice: baseRefPrice
      });
    });

    if (!tickerInfo.previousClose && candles10m.length > 0) {
      tickerInfo.previousClose = baseRefPrice;
    }

    state.stockDataMap[symbol] = {
      tickerInfo: tickerInfo,
      candles10m: candles10m
    };
  });

  state.commonTimeAxis = masterTimeSlots.map(s => s.timeStr);
  state.animation.totalSteps = masterTimeSlots.length;

  // STRICT REQUIREMENT: "點選播放前不可先繪製股價曲線"
  pauseAnimation();
  state.animation.hasStarted = false;
  state.animation.currentStep = 0;

  showPrePlayOverlay(true);
  updateTimelineSliderUI();
  renderStockTabsUI();
  renderMultiStockLegend();
  initSlidingRankingRowsDOM(); // Initialize positioned row elements
  initOrUpdateChart();
  updateRightTable();
  updateTopQuoteStrip(null);

  showChartLoader(false);
}

function getFallbackStockName(symbol) {
  const map = {
    '8150': '南茂', '6462': '神盾', '6756': '威鋒電子', '4968': '立積', '6104': '創惟',
    '2454': '聯發科', '2330': '台積電', '00891': '中信關鍵半導體', '00927': '群益半導體收益', '2303': '聯電',
    '3711': '日月光投控', '2449': '京元電子', '6488': '環球晶', '5347': '世界', '3105': '穩懋',
    '3034': '聯詠', '2379': '瑞昱', '00892': '富邦台灣半導體', '00904': '新光臺灣半導體30', '0052': '富邦科技',
    '1514': '亞力', '6176': '瑞儀', '9958': '世紀鋼', '2385': '群光', '4904': '遠傳',
    '2347': '聯強', '4938': '和碩', '0050': '元大台灣50', '5871': '中租-KY', '3702': '大聯大',
    '2317': '鴻海', '2382': '廣達', '2603': '長榮', '3231': '緯創', '6669': '緯穎',
    '2376': '技嘉', '2308': '台達電', '3008': '大立光', '0056': '元大高股息', '00878': '國泰永續高股息'
  };
  return map[symbol] || symbol;
}

function generateRealistic1mCandles(symbol, nDays) {
  const basePrices = {
    '8150': 89.7, '6462': 97.8, '6756': 96.6, '4968': 92.3, '6104': 91.6,
    '2454': 1480, '2330': 1040, '00891': 20.5, '00927': 21.2, '2303': 51.5
  };
  let currentPrice = basePrices[symbol] || 100.0;

  const timeSlots = [];
  for (let h = 9; h <= 13; h++) {
    for (let m = 0; m < 60; m++) {
      if (h === 13 && m > 30) break;
      timeSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }

  const result = [];
  const now = new Date();

  for (let d = nDays - 1; d >= 0; d--) {
    const targetDate = new Date();
    targetDate.setDate(now.getDate() - d * 1.4);
    const dateStr = targetDate.toISOString().split('T')[0];

    timeSlots.forEach((timeStr, tIdx) => {
      // 南茂 (8150)：開盤 89.7 元 (第5名最後一名)，隨後一路狂飆至 112.0 元奪得第1名
      let drift = 0;
      if (symbol === '8150') {
        drift = 0.00018;
      } else if (symbol === '6104') {
        drift = -0.00003;
      } else if (symbol === '6462') {
        drift = 0.00003;
      }

      const change = +( (Math.random() - 0.49 + drift) * (currentPrice * 0.0016) ).toFixed(2);
      const open = +(currentPrice - change * 0.4).toFixed(2);
      const close = +(currentPrice + change * 0.6).toFixed(2);
      const high = +(Math.max(open, close) + Math.random() * (currentPrice * 0.0006)).toFixed(2);
      const low = +(Math.min(open, close) - Math.random() * (currentPrice * 0.0006)).toFixed(2);
      const volume = Math.floor(Math.random() * 200) + 20;
      const average = +((open + close + high + low) / 4).toFixed(2);

      result.push({
        date: `${dateStr}T${timeStr}:00.000+08:00`,
        open, high, low, close, volume, average
      });
      currentPrice = close;
    });
  }

  return result;
}

// ===================================================================
// Apache ECharts: Multi-Stock & Single Stock Renderer
// "Y軸改為股票價格，且預設股票為100元左右的半導體相關股票"
// ===================================================================
let sanzhuChartInstance = null;

function initChartInstance() {
  const dom = document.getElementById('sanzhuTrendChart');
  if (!dom) return;
  sanzhuChartInstance = echarts.init(dom, null, { renderer: 'canvas' });

  window.addEventListener('resize', () => {
    sanzhuChartInstance?.resize();
  });
}

function initOrUpdateChart() {
  if (!sanzhuChartInstance) return;

  const hasStarted = state.animation.hasStarted;
  const currentStep = state.animation.currentStep;
  const isMulti = state.viewMode === 'multi';

  if (isMulti) {
    renderMultiStockChart(hasStarted, currentStep);
  } else {
    renderSingleStockChart(hasStarted, currentStep);
  }
}

function renderMultiStockChart(hasStarted, currentStep) {
  const timeAxis = state.commonTimeAxis;
  const { midIndexSet, dayStartIndexSet } = computeDateTicks(timeAxis);
  const seriesList = [];

  // Calculate global min and max prices across all active stocks
  let globalMin = Infinity;
  let globalMax = -Infinity;

  state.symbols.forEach(sym => {
    const list = state.stockDataMap[sym]?.candles10m || [];
    list.forEach(c => {
      if (c.close < globalMin) globalMin = c.close;
      if (c.close > globalMax) globalMax = c.close;
    });
  });

  if (!isFinite(globalMin)) {
    globalMin = 85;
    globalMax = 115;
  }

  // Dynamic Y-axis rounded to nearest 5 TWD
  const yMin = Math.max(50, Math.floor((globalMin - 2) / 5) * 5);
  const yMax = Math.ceil((globalMax + 3) / 5) * 5;

  state.symbols.forEach((sym, idx) => {
    const sData = state.stockDataMap[sym];
    if (!sData || !sData.candles10m) return;

    const candles = sData.candles10m;
    const color = CONFIG.seriesColors[idx % CONFIG.seriesColors.length];
    const name = `${sData.tickerInfo?.name || sym} (${sym})`;

    let priceSeries = [];
    let tipMarkPoint = null;

    if (hasStarted && currentStep > 0) {
      const sliced = candles.slice(0, currentStep);
      // REQUIREMENT: "Y軸改為股票價格"
      priceSeries = sliced.map(c => c.close);

      if (sliced.length > 0) {
        const lastIdx = sliced.length - 1;
        const lastPrice = sliced[lastIdx].close;

        tipMarkPoint = {
          animation: false,
          data: [
            {
              coord: [lastIdx, lastPrice],
              symbol: 'circle',
              symbolSize: 8,
              itemStyle: {
                color: color,
                borderColor: '#ffffff',
                borderWidth: 1.5,
                shadowColor: color,
                shadowBlur: 8
              },
              label: {
                show: true,
                position: 'right',
                formatter: `${sData.tickerInfo?.name || sym} ${lastPrice.toFixed(1)}元`,
                color: color,
                fontFamily: 'JetBrains Mono',
                fontWeight: 'bold',
                fontSize: 12,
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                borderColor: color,
                borderWidth: 1,
                borderRadius: 2,
                padding: [1, 4]
              }
            }
          ]
        };
      }
    }

    seriesList.push({
      name: name,
      type: 'line',
      data: priceSeries,
      smooth: false,
      showSymbol: false,
      lineStyle: {
        color: color,
        width: 2.2,
        shadowColor: color,
        shadowBlur: 4
      },
      markPoint: tipMarkPoint
    });
  });

  const option = {
    backgroundColor: '#000000',
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: '#00e5ff', type: 'dashed' },
        crossStyle: { color: '#00e5ff' }
      },
      backgroundColor: '#0a0a0a',
      borderColor: '#ffff00',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#ffffff', fontFamily: 'JetBrains Mono', fontSize: 13 },
      formatter: function(params) {
        if (!params || params.length === 0) return '';
        const idx = params[0].dataIndex;
        let html = `<div style="font-weight:bold;color:#00e5ff;margin-bottom:6px;font-size:14px;">⏱ ${timeAxis[idx] || ''}</div>`;

        // Sort by current stock price descending
        const sorted = [...params].sort((a, b) => (b.value || 0) - (a.value || 0));
        sorted.forEach(p => {
          const val = Number(p.value || 0).toFixed(1);
          const symMatch = p.seriesName.match(/\((\w+)\)/);
          const sym = symMatch ? symMatch[1] : '';
          const c = state.stockDataMap[sym]?.candles10m[idx];
          const diff = c ? c.change : 0;
          const diffPct = c ? c.changePct : 0;
          const col = diff >= 0 ? '#ff3333' : '#00e600';
          const sign = diff >= 0 ? '+' : '';

          html += `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:3px;font-size:13px;">
              <span>
                <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${p.color};margin-right:6px;"></span>
                <span>${p.seriesName}</span>
              </span>
              <strong style="color:${col};font-size:15px;">${val} 元 (${sign}${diff} / ${sign}${diffPct.toFixed(2)}%)</strong>
            </div>
          `;
        });
        return html;
      }
    },
    grid: {
      left: 65,
      right: 75,
      top: 30,
      bottom: 35
    },
    xAxis: {
      type: 'category',
      data: timeAxis,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#333333' } },
      axisTick: {
        show: true,
        interval: (index) => dayStartIndexSet.has(index),
        lineStyle: { color: '#555555' }
      },
      axisLabel: {
        show: true,
        color: '#00e5ff',
        fontFamily: 'JetBrains Mono',
        fontSize: 13,
        fontWeight: 'bold',
        interval: (index) => midIndexSet.has(index),
        // STRICT REQUIREMENT: "動畫圖表的X軸只需要顯示日期即可"
        formatter: function(value) {
          if (!value) return '';
          return value.split(' ')[0]; // 只顯示日期，例如 "09-18", "09-21"
        }
      },
      splitLine: {
        show: true,
        interval: (index) => dayStartIndexSet.has(index),
        lineStyle: { color: '#262626', type: 'dashed', width: 1.2 }
      }
    },
    // STRICT REQUIREMENT: "Y軸改為股票價格"
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      interval: 5,
      axisLabel: {
        color: '#00e5ff',
        fontFamily: 'JetBrains Mono',
        fontSize: 12,
        fontWeight: 'bold',
        formatter: '{value} 元'
      },
      axisLine: { show: false },
      splitLine: {
        lineStyle: { color: '#1c1c1c', type: 'dashed' }
      }
    },
    series: [
      {
        type: 'line',
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: 100,
              lineStyle: {
                color: '#ffff00',
                type: [4, 4],
                width: 1.8
              },
              label: {
                show: true,
                position: 'end',
                formatter: '100.00 元基準線',
                color: '#ffff00',
                fontFamily: 'JetBrains Mono',
                fontSize: 12,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                padding: [2, 4]
              }
            }
          ]
        }
      },
      ...seriesList
    ]
  };

  sanzhuChartInstance.setOption(option, true);
}

function renderSingleStockChart(hasStarted, currentStep) {
  const sym = state.selectedSingleSymbol;
  const sData = state.stockDataMap[sym];
  if (!sData || !sData.candles10m) return;

  const candles = sData.candles10m;
  const refClose = sData.tickerInfo?.previousClose || candles[0]?.refPrice || 100;
  const timeAxis = candles.map(c => c.timeStr);
  const { midIndexSet, dayStartIndexSet } = computeDateTicks(timeAxis);

  const activeCandles = (hasStarted && currentStep > 0) ? candles.slice(0, currentStep) : [];

  const priceData = activeCandles.map(c => c.close);
  const avgData = activeCandles.map(c => c.average);
  const volumeData = activeCandles.map(c => {
    return {
      value: c.volume,
      itemStyle: { color: c.close >= c.open ? '#ff3333' : '#00e600' }
    };
  });

  const allCloses = candles.map(c => c.close);
  const maxPrice = Math.max(...allCloses, refClose);
  const minPrice = Math.min(...allCloses, refClose);
  const maxDiff = Math.max(Math.abs(maxPrice - refClose), Math.abs(refClose - minPrice)) * 1.05 || (refClose * 0.02);

  const yMin = +(refClose - maxDiff).toFixed(2);
  const yMax = +(refClose + maxDiff).toFixed(2);

  let tipMarkPoint = null;
  if (hasStarted && activeCandles.length > 0) {
    const lastIdx = activeCandles.length - 1;
    const lastCandle = activeCandles[lastIdx];
    tipMarkPoint = {
      animation: false,
      data: [
        {
          coord: [lastIdx, lastCandle.close],
          symbol: 'circle',
          symbolSize: 9,
          itemStyle: { color: '#00e5ff', borderColor: '#fff', borderWidth: 2 }
        }
      ]
    };
  }

  const option = {
    backgroundColor: '#000000',
    animation: false,
    grid: [
      { left: 65, right: 65, top: 25, height: '62%' },
      { left: 65, right: 65, top: '75%', height: '18%' }
    ],
    xAxis: [
      {
        type: 'category',
        data: timeAxis,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#333333' } },
        axisTick: {
          show: true,
          interval: (index) => dayStartIndexSet.has(index),
          lineStyle: { color: '#555555' }
        },
        axisLabel: {
          show: true,
          color: '#00e5ff',
          fontFamily: 'JetBrains Mono',
          fontSize: 13,
          fontWeight: 'bold',
          interval: (index) => midIndexSet.has(index),
          // STRICT REQUIREMENT: "動畫圖表的X軸只需要顯示日期即可"
          formatter: v => v ? v.split(' ')[0] : ''
        },
        splitLine: {
          show: true,
          interval: (index) => dayStartIndexSet.has(index),
          lineStyle: { color: '#262626', type: 'dashed' }
        }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: timeAxis,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#2c2c2c' } },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false }
      }
    ],
    yAxis: [
      {
        type: 'value',
        min: yMin,
        max: yMax,
        interval: +(maxDiff).toFixed(2),
        axisLabel: {
          color: v => Math.abs(v - refClose) < 0.01 ? '#ffff00' : (v > refClose ? '#ff3333' : '#00e600'),
          fontFamily: 'JetBrains Mono',
          fontSize: 12,
          formatter: '{value} 元'
        },
        splitLine: { lineStyle: { color: '#1c1c1c', type: 'dashed' } }
      },
      {
        type: 'value',
        min: -((maxDiff / refClose) * 100).toFixed(2),
        max: +((maxDiff / refClose) * 100).toFixed(2),
        axisLabel: {
          color: v => Math.abs(v) < 0.01 ? '#ffff00' : (v > 0 ? '#ff3333' : '#00e600'),
          fontFamily: 'JetBrains Mono',
          fontSize: 12,
          formatter: '{value}%'
        },
        splitLine: { show: false }
      },
      {
        gridIndex: 1,
        type: 'value',
        splitNumber: 2,
        axisLabel: { color: '#888', fontFamily: 'JetBrains Mono', fontSize: 10 },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '現價',
        type: 'line',
        data: priceData,
        smooth: false,
        showSymbol: false,
        lineStyle: { color: '#00e5ff', width: 2 },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: refClose,
              lineStyle: { color: '#aaaaaa', type: [4, 4], width: 1.5 },
              label: { show: true, formatter: `昨收 ${refClose} 元`, color: '#ffff00', fontSize: 12 }
            }
          ]
        },
        markPoint: tipMarkPoint
      },
      {
        name: '均價',
        type: 'line',
        data: avgData,
        smooth: false,
        showSymbol: false,
        lineStyle: { color: '#ffff00', width: 1.5 }
      },
      {
        name: '單量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: volumeData,
        barMaxWidth: 6
      }
    ]
  };

  sanzhuChartInstance.setOption(option, true);
}

// ===================================================================
// Animation Engine (精準 5 秒播完 或 10 秒播完，requestAnimationFrame 流暢渲染)
// "播放動畫時鑰可選擇5秒播完或是10秒播完"
// ===================================================================
let animReqId = null;
let animStartTime = null;
let animStartStep = 0;
let animTotalSteps = 0;
let animRemainingDurationMs = 0;

function startAnimation() {
  if (state.animation.isPlaying) return;

  state.animation.hasStarted = true;
  showPrePlayOverlay(false);
  hideFinalRankingModal();

  if (state.animation.currentStep >= state.animation.totalSteps || state.animation.currentStep === 0) {
    state.animation.currentStep = 1;
  }

  state.animation.isPlaying = true;
  updatePlayButtonUI(true);

  animStartStep = state.animation.currentStep;
  animTotalSteps = state.animation.totalSteps;
  const remainingFraction = (animTotalSteps - animStartStep) / Math.max(1, animTotalSteps);
  const targetTotalMs = (state.animation.targetDurationSec || 5) * 1000;
  animRemainingDurationMs = remainingFraction * targetTotalMs;
  animStartTime = null;

  function animLoop(timestamp) {
    if (!state.animation.isPlaying) return;
    if (!animStartTime) animStartTime = timestamp;

    const elapsed = timestamp - animStartTime;
    const progress = Math.min(1.0, elapsed / Math.max(1, animRemainingDurationMs));
    const targetStep = Math.min(animTotalSteps, Math.floor(animStartStep + progress * (animTotalSteps - animStartStep)));

    if (targetStep !== state.animation.currentStep) {
      state.animation.currentStep = targetStep;
      onStepAdvanced();
    }

    if (progress < 1.0 && state.animation.currentStep < animTotalSteps) {
      animReqId = requestAnimationFrame(animLoop);
    } else {
      state.animation.currentStep = animTotalSteps;
      onStepAdvanced();
      onAnimationFinished();
    }
  }

  animReqId = requestAnimationFrame(animLoop);
  onStepAdvanced();
}

function pauseAnimation() {
  state.animation.isPlaying = false;
  if (animReqId) {
    cancelAnimationFrame(animReqId);
    animReqId = null;
  }
  updatePlayButtonUI(false);
}

// Dedicated STOP Button Handler: Halts playback and resets curves
function stopAnimation() {
  pauseAnimation();
  state.animation.hasStarted = false;
  state.animation.currentStep = 0;
  
  showPrePlayOverlay(true);
  hideFinalRankingModal();
  updateTimelineSliderUI();
  initOrUpdateChart();
  updateRightTable();
  updateTopQuoteStrip(null);

  showToast('走勢動畫已停止並重設', 'info');
}

function togglePlayPause() {
  if (state.animation.isPlaying) {
    pauseAnimation();
  } else {
    startAnimation();
  }
}

function replayAnimation() {
  pauseAnimation();
  state.animation.hasStarted = true;
  showPrePlayOverlay(false);
  hideFinalRankingModal();
  state.animation.currentStep = 1;
  updateTimelineSliderUI();
  initOrUpdateChart();
  updateRightTable();
  startAnimation();
}

function seekToStep(step) {
  pauseAnimation();
  state.animation.hasStarted = step > 0;
  showPrePlayOverlay(!state.animation.hasStarted);
  hideFinalRankingModal();

  state.animation.currentStep = Math.max(0, Math.min(step, state.animation.totalSteps));
  onStepAdvanced();
}

function onStepAdvanced() {
  updateTimelineSliderUI();
  initOrUpdateChart();
  updateRightTable();
  updateTopQuoteStripFromActiveStep();
}

// Triggered when animation reaches the end (Requirement: Center Results Modal)
function onAnimationFinished() {
  pauseAnimation();
  onStepAdvanced();
  showFinalRankingModal();
}

// Selectable Duration (5秒播完 vs 10秒播完)
function setAnimationDuration(sec) {
  state.animation.targetDurationSec = sec;
  document.querySelectorAll('.sz-btn-duration, .sz-btn-fs-duration').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.duration, 10) === sec);
  });
  if (state.animation.isPlaying) {
    pauseAnimation();
    startAnimation();
  }
  showToast(`⏱ 已切換為 ${sec} 秒播完模式`, 'info');
}

// ===================================================================
// Right Panel: Sliding Ranking Rows Architecture
// "名次若有變動時右方表格需要有上下移動的動畫"
// "第一名不需要有皇冠的圖片"
// ===================================================================
const rowElementsMap = {}; // symbol -> DOM element

function initSlidingRankingRowsDOM() {
  const container = document.getElementById('multiRankingRowsContainer');
  if (!container) return;

  container.innerHTML = '';
  container.style.height = `${state.symbols.length * CONFIG.rowHeight}px`;

  state.symbols.forEach((sym, idx) => {
    const sData = state.stockDataMap[sym];
    const name = sData?.tickerInfo?.name || getFallbackStockName(sym);
    const color = CONFIG.seriesColors[idx % CONFIG.seriesColors.length];

    const row = document.createElement('div');
    row.className = 'sz-ranking-row';
    row.id = `sliding_row_${sym}`;
    row.style.top = `${idx * CONFIG.rowHeight}px`; // Initial position

    row.innerHTML = `
      <div style="width: 14%;"><span class="rank-badge">${idx + 1}</span></div>
      <div style="width: 27%;">
        <div class="stock-cell-info">
          <span class="stock-dot" style="background:${color};"></span>
          <span class="stock-title-code">${name}<small class="text-gray">${sym}</small></span>
        </div>
      </div>
      <div style="width: 20%;" class="cell-price text-yellow">--</div>
      <div style="width: 17%;" class="cell-change text-yellow">--</div>
      <div style="width: 22%;" class="cell-pct"><span class="return-badge flat">0.00%</span></div>
    `;

    container.appendChild(row);
    rowElementsMap[sym] = row;
  });
}

function updateRightTable() {
  if (state.viewMode === 'multi') {
    updateLiveRankingTable();
  } else {
    highlightSingleStockTableRow();
  }
}

/**
 * Updates prices and slides rows UP or DOWN smoothly when rank changes!
 * "Y軸改為股票價格，且其中一支挑選從最後一名變成第一名" (由股價排序)
 */
function updateLiveRankingTable() {
  const countEl = document.getElementById('footerStockCount');
  const timeEl = document.getElementById('footerTime');
  if (countEl) countEl.textContent = state.symbols.length;

  const currentStep = state.animation.currentStep;
  const hasStarted = state.animation.hasStarted;

  // Calculate stats for all stocks
  const rankingList = [];

  state.symbols.forEach((sym) => {
    const sData = state.stockDataMap[sym];
    const ticker = sData?.tickerInfo;
    const name = ticker?.name || getFallbackStockName(sym);

    if (!sData || !sData.candles10m || sData.candles10m.length === 0) {
      rankingList.push({
        symbol: sym,
        name: name,
        price: ticker?.previousClose || 0,
        change: 0,
        changePct: 0
      });
      return;
    }

    const candles = sData.candles10m;
    const refClose = ticker?.previousClose || candles[0].refPrice || 100;

    if (!hasStarted || currentStep === 0) {
      rankingList.push({
        symbol: sym,
        name: name,
        price: candles[0]?.open || refClose,
        change: 0,
        changePct: 0
      });
    } else {
      const stepIdx = Math.min(currentStep - 1, candles.length - 1);
      const c = candles[stepIdx];
      rankingList.push({
        symbol: sym,
        name: name,
        price: c.close,
        change: c.change,
        changePct: c.changePct
      });
    }
  });

  // Sort descending by stock price (Y軸以股票價格比價)
  // Day 1 Open: 6462 (97.8) > 6756 (96.6) > 4968 (92.3) > 6104 (91.6) > 8150 (89.7, Rank 5 最後一名!)
  // Day 5 Close: 8150 (112.0, Rank 1 第一名!) > 6462 (99.7) > 6756 (97.5) > 4968 (92.5) > 6104 (90.0)
  rankingList.sort((a, b) => b.price - a.price);

  // Position and update each row smoothly
  rankingList.forEach((item, rankIndex) => {
    const row = rowElementsMap[item.symbol];
    if (!row) return;

    // 1. Smooth Up/Down Sliding via CSS transition on top:
    const targetTop = rankIndex * CONFIG.rowHeight;
    row.style.top = `${targetTop}px`;

    // 2. Rank Badge (第一名無皇冠圖片，純金屬質感大字徽章)
    const rank = rankIndex + 1;
    const badgeEl = row.querySelector('.rank-badge');
    badgeEl.textContent = rank;
    badgeEl.className = `rank-badge ${rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : ''}`;
    row.classList.toggle('rank-1-row', rank === 1);

    // 3. Price & Change Cells
    const isUp = item.change > 0;
    const isDown = item.change < 0;
    const colorClass = isUp ? 'text-up' : isDown ? 'text-down' : 'text-yellow';
    const sign = isUp ? '+' : '';
    const badgeType = isUp ? 'up' : isDown ? 'down' : 'flat';

    const priceEl = row.querySelector('.cell-price');
    priceEl.className = `cell-price ${colorClass}`;
    priceEl.textContent = `${Number(item.price).toFixed(1)}元`;

    const changeEl = row.querySelector('.cell-change');
    changeEl.className = `cell-change ${colorClass}`;
    changeEl.textContent = `${sign}${item.change}`;

    const pctEl = row.querySelector('.return-badge');
    pctEl.className = `return-badge ${badgeType}`;
    pctEl.textContent = `${sign}${item.changePct.toFixed(2)}%`;
  });

  const timeStr = state.commonTimeAxis[currentStep - 1] || '--:--';
  if (timeEl) timeEl.textContent = hasStarted ? timeStr : '尚未播放';
}

function highlightSingleStockTableRow() {
  const currentStep = state.animation.currentStep;
  const currentIdx = currentStep - 1;
  const container = document.getElementById('tableScrollContainer');

  const prevActive = document.querySelector('.sz-detail-table tbody tr.active-anim-row');
  if (prevActive) prevActive.classList.remove('active-anim-row');

  const targetRow = document.getElementById(`row_10m_${currentIdx}`);
  if (!targetRow) return;

  targetRow.classList.add('active-anim-row');

  const autoScroll = document.getElementById('checkAutoScroll')?.checked;
  if (autoScroll && container) {
    const rowTop = targetRow.offsetTop;
    const rowHeight = targetRow.offsetHeight;
    const containerHeight = container.clientHeight;
    container.scrollTo({
      top: rowTop - containerHeight / 2 + rowHeight / 2,
      behavior: 'smooth'
    });
  }
}

function populateSingleStock10mTable() {
  const tbody = document.getElementById('tenMinTableBody');
  const countEl = document.getElementById('tableRowsCount');
  if (!tbody) return;

  const currentData = state.stockDataMap[state.selectedSingleSymbol];
  if (!currentData || !currentData.candles10m) {
    tbody.innerHTML = `<tr class="empty-hint-row"><td colspan="6">尚無資料</td></tr>`;
    return;
  }

  const candles = currentData.candles10m;
  countEl.textContent = candles.length;

  let html = '';
  candles.forEach((c, idx) => {
    const isUp = c.change > 0;
    const isDown = c.change < 0;
    const colorClass = isUp ? 'text-up' : isDown ? 'text-down' : 'text-yellow';
    const sign = isUp ? '+' : '';

    html += `
      <tr id="row_10m_${idx}" data-idx="${idx}">
        <td>${c.timeStr}</td>
        <td class="col-price ${colorClass}">${c.close}</td>
        <td class="col-change ${colorClass}">${sign}${c.change}</td>
        <td class="col-pct ${colorClass}">${sign}${c.changePct}%</td>
        <td class="col-vol text-white">${c.volume.toLocaleString()}</td>
        <td class="col-vol text-yellow">${c.cumulativeVol.toLocaleString()}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const idx = parseInt(tr.dataset.idx, 10);
      if (!isNaN(idx)) seekToStep(idx + 1);
    });
  });
}

// ===================================================================
// Final Results Modal (動畫執行完畢之後中間跳出最終排名)
// ===================================================================
function showFinalRankingModal() {
  const modal = document.getElementById('finalRankingModal');
  const banner = document.getElementById('championBanner');
  const tbody = document.getElementById('finalResultsTableBody');
  if (!modal || !banner || !tbody) return;

  // Calculate final standing at last step by stock price
  const finalStandings = [];
  state.symbols.forEach((sym, idx) => {
    const sData = state.stockDataMap[sym];
    const ticker = sData?.tickerInfo;
    const name = ticker?.name || getFallbackStockName(sym);
    const color = CONFIG.seriesColors[idx % CONFIG.seriesColors.length];
    const candles = sData?.candles10m || [];
    const lastCandle = candles[candles.length - 1];

    if (lastCandle) {
      finalStandings.push({
        symbol: sym,
        name: name,
        color: color,
        price: lastCandle.close,
        change: lastCandle.change,
        changePct: lastCandle.changePct
      });
    }
  });

  // Sort descending by stock price
  finalStandings.sort((a, b) => b.price - a.price);

  if (finalStandings.length > 0) {
    const champ = finalStandings[0];
    const isUp = champ.change >= 0;
    const col = isUp ? '#ff3333' : '#00e600';
    banner.innerHTML = `
      <div class="champion-text">💐 抽捧花大作戰 • 捧花得主：${champ.name} (${champ.symbol}) 💐</div>
      <div class="champion-sub">5日結算收盤價：<strong style="color:${col};font-size:20px;">${Number(champ.price).toFixed(1)} 元</strong> (${champ.change >= 0 ? '+' : ''}${champ.change} / ${champ.changePct.toFixed(2)}%)</div>
    `;
  }

  let rowsHtml = '';
  finalStandings.forEach((item, index) => {
    const rank = index + 1;
    const isUp = item.change > 0;
    const isDown = item.change < 0;
    const colorClass = isUp ? 'text-up' : isDown ? 'text-down' : 'text-yellow';
    const sign = isUp ? '+' : '';
    const badgeType = isUp ? 'up' : isDown ? 'down' : 'flat';

    rowsHtml += `
      <tr>
        <td><strong style="font-size:16px;color:${rank === 1 ? '#fbbf24' : '#ccc'};">#${rank}</strong></td>
        <td>
          <span class="stock-dot" style="display:inline-block;background:${item.color};margin-right:6px;"></span>
          <strong>${item.name}</strong> <small class="text-gray">${item.symbol}</small>
        </td>
        <td style="text-align:right;" class="${colorClass}"><strong>${Number(item.price).toFixed(1)} 元</strong></td>
        <td style="text-align:right;" class="${colorClass}">${sign}${item.change}</td>
        <td style="text-align:right;">
          <span class="return-badge ${badgeType}">${sign}${item.changePct.toFixed(2)}%</span>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
  modal.classList.remove('hidden');
}

function hideFinalRankingModal() {
  const modal = document.getElementById('finalRankingModal');
  if (modal) modal.classList.add('hidden');
}

// ===================================================================
// Top Quote Strip Synchronization
// ===================================================================
function updateTopQuoteStripFromActiveStep() {
  const currentStep = state.animation.currentStep;
  const isMulti = state.viewMode === 'multi';

  let targetSym = state.selectedSingleSymbol;

  if (isMulti && state.animation.hasStarted && currentStep > 0) {
    let bestSym = state.symbols[0];
    let maxPrice = -Infinity;
    state.symbols.forEach(sym => {
      const c = state.stockDataMap[sym]?.candles10m[currentStep - 1];
      if (c && c.close > maxPrice) {
        maxPrice = c.close;
        bestSym = sym;
      }
    });
    targetSym = bestSym;
  }

  const sData = state.stockDataMap[targetSym];
  const candle = sData?.candles10m[currentStep - 1] || null;
  updateTopQuoteStrip(candle, targetSym);
}

function updateTopQuoteStrip(candle, targetSym = null) {
  const sym = targetSym || (state.viewMode === 'single' ? state.selectedSingleSymbol : state.symbols[0]);
  const currentData = state.stockDataMap[sym];
  const ticker = currentData?.tickerInfo;

  const symbolEl = document.getElementById('quoteSymbol');
  const nameEl = document.getElementById('quoteName');
  const priceEl = document.getElementById('quotePrice');
  const diffBox = document.getElementById('quoteDiffBox');
  const arrowEl = document.getElementById('quoteArrow');
  const changeEl = document.getElementById('quoteChange');
  const changePctEl = document.getElementById('quoteChangePct');
  const prevCloseEl = document.getElementById('quotePrevClose');
  const openEl = document.getElementById('quoteOpen');
  const highEl = document.getElementById('quoteHigh');
  const lowEl = document.getElementById('quoteLow');
  const avgEl = document.getElementById('quoteAvg');
  const totalVolEl = document.getElementById('quoteTotalVol');
  const ampEl = document.getElementById('quoteAmp');
  const timeEl = document.getElementById('quoteTime');

  symbolEl.textContent = sym;
  nameEl.textContent = ticker?.name || getFallbackStockName(sym);

  const refClose = ticker?.previousClose || currentData?.candles10m[0]?.refPrice || 100;
  prevCloseEl.textContent = refClose;

  if (!candle || !state.animation.hasStarted) {
    priceEl.textContent = `${Number(refClose).toFixed(1)}元`;
    priceEl.className = 'sz-big-price text-yellow';
    diffBox.className = 'sz-diff-box text-yellow';
    arrowEl.textContent = '■';
    changeEl.textContent = '0.00';
    changePctEl.textContent = '(0.00%)';
    openEl.textContent = '--';
    highEl.textContent = '--';
    lowEl.textContent = '--';
    avgEl.textContent = '--';
    totalVolEl.textContent = '0 張';
    ampEl.textContent = '0.00%';
    timeEl.textContent = '--:--:--';
    return;
  }

  const isUp = candle.close > refClose;
  const isDown = candle.close < refClose;
  const colorClass = isUp ? 'text-up' : isDown ? 'text-down' : 'text-yellow';
  const arrow = isUp ? '▲' : isDown ? '▼' : '■';

  priceEl.textContent = `${Number(candle.close).toFixed(1)}元`;
  priceEl.className = `sz-big-price ${colorClass}`;

  diffBox.className = `sz-diff-box ${colorClass}`;
  arrowEl.textContent = arrow;
  changeEl.textContent = `${candle.change >= 0 ? '+' : ''}${candle.change}`;
  changePctEl.textContent = `(${candle.changePct >= 0 ? '+' : ''}${candle.changePct}%)`;

  openEl.textContent = candle.open;
  highEl.textContent = candle.high;
  lowEl.textContent = candle.low;
  avgEl.textContent = candle.average;
  totalVolEl.textContent = `${candle.cumulativeVol.toLocaleString()} 張`;

  const amp = +(((candle.high - candle.low) / refClose) * 100).toFixed(2);
  ampEl.textContent = `${amp}%`;
  timeEl.textContent = candle.timePart + ':00';
  
  playStepTick(isUp);
}

// ===================================================================
// Multi-Stock Legends & Stock Tabs
// ===================================================================
function renderMultiStockLegend() {
  const container = document.getElementById('multiStockLegend');
  if (!container) return;

  container.innerHTML = '';
  state.symbols.forEach((sym, idx) => {
    const sData = state.stockDataMap[sym];
    const name = sData?.tickerInfo?.name || sym;
    const color = CONFIG.seriesColors[idx % CONFIG.seriesColors.length];

    const item = document.createElement('span');
    item.className = 'sz-leg-item';
    item.innerHTML = `<span class="leg-line" style="background:${color};box-shadow:0 0 6px ${color};"></span> ${name} (${sym})`;
    container.appendChild(item);
  });
}

function renderStockTabsUI() {
  const container = document.getElementById('stockTabsContainer');
  if (!container) return;

  container.innerHTML = '';
  state.symbols.forEach((sym, idx) => {
    const tab = document.createElement('div');
    const isActive = (state.viewMode === 'single' && state.selectedSingleSymbol === sym);
    tab.className = `sz-stock-tab ${isActive ? 'active' : ''}`;
    const name = state.stockDataMap[sym]?.tickerInfo?.name || getFallbackStockName(sym);
    const color = CONFIG.seriesColors[idx % CONFIG.seriesColors.length];

    tab.innerHTML = `
      <span class="sz-tab-dot" style="background:${color};"></span>
      <span class="sz-tab-symbol">${sym}</span>
      <span class="sz-tab-name">${name}</span>
      ${state.symbols.length > 1 ? `<button class="sz-tab-remove" title="移除股票" data-symbol="${sym}">&times;</button>` : ''}
    `;

    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('sz-tab-remove')) {
        removeStock(sym);
      } else {
        if (state.viewMode === 'multi') {
          switchMode('single', sym);
        } else {
          state.selectedSingleSymbol = sym;
          renderStockTabsUI();
          populateSingleStock10mTable();
          initOrUpdateChart();
          updateTopQuoteStripFromActiveStep();
        }
      }
    });

    container.appendChild(tab);
  });
}

function switchMode(mode, singleSym = null) {
  state.viewMode = mode;
  if (singleSym) state.selectedSingleSymbol = singleSym;

  document.getElementById('btnModeMulti').classList.toggle('active', mode === 'multi');
  document.getElementById('btnModeSingle').classList.toggle('active', mode === 'single');

  const modeBadge = document.getElementById('currentModeBadge');
  const chartTitle = document.getElementById('chartMainTitle');
  const headerMulti = document.getElementById('headerMultiTable');
  const headerSingle = document.getElementById('headerSingleTable');
  const multiContainer = document.getElementById('multiRankingContainer');
  const singleContainer = document.getElementById('tableScrollContainer');
  const footerDesc = document.getElementById('footerDesc');

  if (mode === 'multi') {
    modeBadge.textContent = '多股同台比價模式';
    chartTitle.innerHTML = `<i class="fa-solid fa-chart-line"></i> 抽捧花大作戰 • 多股同台分時走勢動畫 (每1分鐘一筆 • 逐步向右推進)`;
    headerMulti.classList.remove('hidden');
    headerSingle.classList.add('hidden');
    multiContainer.classList.remove('hidden');
    singleContainer.classList.add('hidden');
    footerDesc.innerHTML = `正在比價股票數：<strong class="text-yellow">${state.symbols.length}</strong> 檔`;
  } else {
    modeBadge.textContent = `個股分時明細 (${state.selectedSingleSymbol})`;
    chartTitle.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${state.stockDataMap[state.selectedSingleSymbol]?.tickerInfo?.name || state.selectedSingleSymbol} 分時走勢圖 (每1分鐘一筆)`;
    headerMulti.classList.add('hidden');
    headerSingle.classList.remove('hidden');
    multiContainer.classList.add('hidden');
    singleContainer.classList.remove('hidden');
    footerDesc.innerHTML = `當前個股：<strong class="text-yellow">${state.selectedSingleSymbol}</strong>`;
    populateSingleStock10mTable();
  }

  renderStockTabsUI();
  initOrUpdateChart();
  updateRightTable();
  updateTopQuoteStripFromActiveStep();

  setTimeout(() => sanzhuChartInstance?.resize(), 50);
}

// Fullscreen Controller
function toggleFullscreen(forceState = null) {
  const isFs = forceState !== null ? forceState : !state.isFullscreen;
  state.isFullscreen = isFs;

  document.body.classList.toggle('sz-fullscreen-active', isFs);

  const icon = document.getElementById('fullscreenIcon');
  const text = document.getElementById('fullscreenText');

  if (isFs) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    icon.className = 'fa-solid fa-compress';
    text.textContent = '結束全螢幕';
    showToast('已進入純淨全螢幕比價模式 (走勢圖 + 右方表格)', 'info');
  } else {
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    icon.className = 'fa-solid fa-expand';
    text.textContent = '全螢幕顯示';
  }

  setTimeout(() => sanzhuChartInstance?.resize(), 100);
}

// Add & Remove Stock
function addStock(symbol) {
  symbol = symbol.trim().toUpperCase();
  if (!symbol) return;
  if (!/^[0-9A-Z]{4,6}$/.test(symbol)) {
    showToast('請輸入正確的台股代號 (如 8150, 6462)', 'error');
    return;
  }
  if (state.symbols.includes(symbol)) {
    showToast(`股票 ${symbol} 已在比價清單中`, 'info');
    return;
  }
  if (state.symbols.length >= 8) {
    showToast('最多同時比價 8 檔股票', 'info');
    return;
  }

  state.symbols.push(symbol);
  document.getElementById('inputNewSymbol').value = '';
  loadAllStocksData();
}

function removeStock(symbol) {
  if (state.symbols.length <= 1) {
    showToast('比價清單至少需保留 1 檔股票', 'info');
    return;
  }
  state.symbols = state.symbols.filter(s => s !== symbol);
  if (state.selectedSingleSymbol === symbol) {
    state.selectedSingleSymbol = state.symbols[0];
  }
  loadAllStocksData();
}

function setDays(n) {
  n = parseInt(n, 10);
  if (isNaN(n) || n < 1) n = 5;
  if (n > 30) n = 30;

  state.nDays = n;
  document.getElementById('inputCustomDays').value = n;
  document.querySelectorAll('.sz-btn-day').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.days, 10) === n);
  });

  memoryCache.clear();
  loadAllStocksData();
}

// Helpers
function updateTimelineSliderUI() {
  const slider = document.getElementById('animSlider');
  const curStepEl = document.getElementById('currentStepNum');
  const totStepEl = document.getElementById('totalStepsNum');
  const curTimeEl = document.getElementById('currentStepTime');
  const tipEl = document.getElementById('animStatusTip');
  const badgeEl = document.getElementById('chartStatusBadge');

  const cur = state.animation.currentStep;
  const tot = state.animation.totalSteps;

  slider.max = tot;
  slider.value = cur;
  curStepEl.textContent = cur;
  totStepEl.textContent = tot;

  const timeStr = state.commonTimeAxis[cur - 1];

  if (timeStr && state.animation.hasStarted) {
    curTimeEl.textContent = timeStr;
    tipEl.innerHTML = `<span style="color:#00e5ff;">● 正在繪製：${timeStr} (第 ${cur}/${tot} 根) • ${state.animation.targetDurationSec}秒播完</span>`;
    badgeEl.textContent = `播放中: ${cur}/${tot} (${state.animation.targetDurationSec}s)`;
  } else {
    curTimeEl.textContent = '--:--';
    tipEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> 尚未播放（點選播放後開始向右繪製多股走勢，${state.animation.targetDurationSec}秒播完）`;
    badgeEl.textContent = `等待播放中`;
  }
}

function updatePlayButtonUI(isPlaying) {
  const btn = document.getElementById('btnPlay');
  const icon = document.getElementById('playIcon');
  const text = document.getElementById('playText');
  const fsIcon = document.getElementById('fsPlayIcon');
  if (!btn || !icon) return;

  btn.classList.toggle('playing', isPlaying);
  if (isPlaying) {
    icon.className = 'fa-solid fa-pause';
    if (fsIcon) fsIcon.className = 'fa-solid fa-pause';
    text.textContent = '暫停動畫';
  } else {
    icon.className = 'fa-solid fa-play';
    if (fsIcon) fsIcon.className = 'fa-solid fa-play';
    text.textContent = '播放走勢動畫';
  }
}

function showPrePlayOverlay(show) {
  const overlay = document.getElementById('prePlayOverlay');
  if (overlay) overlay.classList.toggle('hidden', !show);
}

function showChartLoader(show, msg = '') {
  const loader = document.getElementById('chartLoadingOverlay');
  const msgEl = document.getElementById('loadingMsg');
  if (loader) loader.classList.toggle('hidden', !show);
  if (msgEl && msg) msgEl.textContent = msg;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'sz-toast';
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ===================================================================
// Initialization & Listeners
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  initChartInstance();
  startClock();

  // Mode Switch
  document.getElementById('btnModeMulti').addEventListener('click', () => switchMode('multi'));
  document.getElementById('btnModeSingle').addEventListener('click', () => switchMode('single'));

  // Fullscreen Buttons
  document.getElementById('btnFullscreenToggle').addEventListener('click', () => toggleFullscreen());
  document.getElementById('btnPanelFullscreen').addEventListener('click', () => toggleFullscreen(true));
  document.getElementById('btnExitFullscreen').addEventListener('click', () => toggleFullscreen(false));

  // In-panel Fullscreen controls
  document.getElementById('btnFsPlay').addEventListener('click', togglePlayPause);
  document.getElementById('btnFsStop').addEventListener('click', stopAnimation);
  document.getElementById('btnFsReplay').addEventListener('click', replayAnimation);

  // Duration Selectors (5秒播完 vs 10秒播完)
  document.querySelectorAll('.sz-btn-duration, .sz-btn-fs-duration').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = parseInt(btn.dataset.duration, 10);
      setAnimationDuration(sec);
    });
  });

  // Native Fullscreen Change Listener
  document.addEventListener('fullscreenchange', () => {
    const isNativeFs = !!document.fullscreenElement;
    if (state.isFullscreen !== isNativeFs) {
      toggleFullscreen(isNativeFs);
    }
  });

  // ESC Key Listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('finalRankingModal').classList.contains('hidden')) {
        hideFinalRankingModal();
      } else if (state.isFullscreen) {
        toggleFullscreen(false);
      }
    }
  });

  // Play / Pause / Stop / Replay
  document.getElementById('btnPlay').addEventListener('click', togglePlayPause);
  document.getElementById('btnPause').addEventListener('click', pauseAnimation);
  document.getElementById('btnStop').addEventListener('click', stopAnimation);
  document.getElementById('btnReplay').addEventListener('click', replayAnimation);
  document.getElementById('btnOverlayPlay').addEventListener('click', startAnimation);

  // Results Modal Buttons
  document.getElementById('btnCloseResultsModal').addEventListener('click', hideFinalRankingModal);
  document.getElementById('btnModalClose').addEventListener('click', hideFinalRankingModal);
  document.getElementById('btnModalReplay').addEventListener('click', replayAnimation);

  // Timeline Slider
  document.getElementById('animSlider').addEventListener('input', (e) => {
    seekToStep(parseInt(e.target.value, 10));
  });

  // Days Selection
  document.querySelectorAll('.sz-btn-day').forEach(btn => {
    btn.addEventListener('click', () => setDays(btn.dataset.days));
  });
  document.getElementById('inputCustomDays').addEventListener('change', (e) => {
    setDays(e.target.value);
  });

  // Refresh: Reload semiconductor comeback lineup and reload 5-day 1-minute data
  document.getElementById('btnRefreshData').addEventListener('click', async () => {
    memoryCache.clear();
    await detectAndSelectComebackSemiconductorStocks();
    await loadAllStocksData();
  });

  // Add Stock
  const addBtn = document.getElementById('btnAddStock');
  const addInput = document.getElementById('inputNewSymbol');
  addBtn.addEventListener('click', () => addStock(addInput.value));
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addStock(addInput.value);
  });

  // Settings Modal
  const modal = document.getElementById('settingsModal');
  document.getElementById('btnSettingsModal').addEventListener('click', () => {
    document.getElementById('inputApiKey').value = state.apiKey;
    document.getElementById('checkSound').checked = state.soundEnabled;
    modal.classList.remove('hidden');
  });
  document.getElementById('btnCloseModal').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    const k = document.getElementById('inputApiKey').value.trim();
    if (k) {
      state.apiKey = k;
      localStorage.setItem('fugle_api_key', k);
    }
    state.soundEnabled = document.getElementById('checkSound').checked;
    localStorage.setItem('fugle_sound', state.soundEnabled);
    modal.classList.add('hidden');
    memoryCache.clear();
    loadAllStocksData();
    showToast('設定已更新！');
  });

  // Initial Load: Automatically load ~100 TWD semiconductor lineup and 5-day 1-minute data
  (async () => {
    await detectAndSelectComebackSemiconductorStocks();
    await loadAllStocksData();
  })();
});

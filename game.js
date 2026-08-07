// 游戏初始状态
let gameState = {
  day: 1,
  hp: 100,
  food: 3,
  water: 3,
  wood: 0,
  isGameOver: false,
  logs: []
};

// 预设的环境事件选项
const events = [
  "☀️ 天气晴朗，海浪拍打着沙滩。你可以去 1.搜寻食物 2.寻找淡水 3.砍伐木材 4.休息恢复",
  "🌧️ 岛上下起了暴雨！淡水变多了，但气温骤降。你可以去 1.收集雨水 2.加固营地 3.强行外出搜寻",
  "🐗 丛林深处传来野兽的低吼！你可以去 1.制作陷阱 2.冒险打猎 3.躲在营地 4.寻找果实"
];

function appendLog(text) {
  const logDiv = document.getElementById("log");
  gameState.logs.push(text);
  logDiv.innerText += text + "\n\n";
  logDiv.scrollTop = logDiv.scrollHeight;
}

function updateUI() {
  document.getElementById("statusBar").innerText = 
    `📅 天数: ${gameState.day} | ❤️ 体力: ${gameState.hp} | 🍗 食物: ${gameState.food} | 💧 淡水: ${gameState.water} | 🪵 木材: ${gameState.wood}`;
}

// 构建发给 AI 的提示词 (Prompt)
function buildAIPrompt(currentEvent) {
  return `
你正在玩一个纯文本荒岛求生游戏。
【当前状态】
- 天数: 第 ${gameState.day} 天
- ❤️ 体力: ${gameState.hp}/100
- 🍗 食物: ${gameState.food}
- 💧 淡水: ${gameState.water}
- 🪵 木材: ${gameState.wood}

【今日状况】
${currentEvent}

【规则要求】
1. 分析当前数值与生存风险。
2. 做出一个决策。必须从以下格式中挑选，严格以 [ACTION:数字] 结尾（例如: [ACTION:1]）。
3. 输出格式示例：
"思考：当前淡水偏低，优先补充水资源。
决策：选择 2.寻找淡水
[ACTION:2]"
  `;
}

// 核心循环：发给 AI -> 获得决策 -> 结算数值
async function gameLoop() {
  if (gameState.isGameOver) return;

  // 1. 每日基础消耗
  gameState.food--;
  gameState.water--;

  // 检查死因
  if (gameState.food < 0 || gameState.water < 0 || gameState.hp <= 0) {
    gameState.hp = 0;
    updateUI();
    appendLog("☠️ 【游戏结束】AI 未能在荒岛上存活下去...");
    gameState.isGameOver = true;
    return;
  }

  updateUI();
  
  // 随机触发今日事件
  const currentEvent = events[Math.floor(Math.random() * events.length)];
  appendLog(`----------------------------------------\n📅 【第 ${gameState.day} 天】\n${currentEvent}`);

  // 2. 请求 AI 决策
  const prompt = buildAIPrompt(currentEvent);
  const action = await fetchAIDecision(prompt);

  // 3. 根据 AI 的选择结算结果
  executeAction(action);

  // 4. 进入下一天
  gameState.day++;
  updateUI();

  if (gameState.day > 10) {
    appendLog("🎉 【通关胜利】AI 成功在荒岛上坚持存活了 10 天！救援队到达了！");
    gameState.isGameOver = true;
    return;
  }

  // 延迟 3 秒后自动进行下一回合
  setTimeout(gameLoop, 3000);
}

// 调用 API 接口
async function fetchAIDecision(prompt) {
  const apiUrl = document.getElementById("apiUrl").value;
  const apiKey = document.getElementById("apiKey").value;
  const modelName = document.getElementById("modelName").value;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;
    appendLog(`🤖 【AI 的思考与决策】:\n${reply}`);

    // 解析 AI 响应里的 [ACTION:X]
    const match = reply.match(/\[ACTION:(\d+)\]/);
    return match ? parseInt(match[1]) : 1; // 默认选 1
  } catch (err) {
    appendLog(`⚠️ API 请求失败: ${err.message}，默认执行保底动作。`);
    return 1;
  }
}

// 执行结算逻辑
function executeAction(action) {
  let logText = "⚙️ 【结算结果】: ";
  switch (action) {
    case 1:
      gameState.food += 2;
      logText += "获得了 🍗 食物 +2";
      break;
    case 2:
      gameState.water += 2;
      logText += "获得了 💧 淡水 +2";
      break;
    case 3:
      gameState.wood += 2;
      gameState.hp -= 10;
      logText += "获得了 🪵 木材 +2，但消耗了 ❤️ 体力 -10";
      break;
    case 4:
      gameState.hp = Math.min(100, gameState.hp + 20);
      logText += "好好休息了一会儿，❤️ 体力 +20";
      break;
    default:
      logText += "AI 犹豫不决，浪费了一天。";
  }
  appendLog(logText);
}

function startGame() {
  document.getElementById("startBtn").disabled = true;
  document.getElementById("log").innerText = "游戏开始！求生信号发射中...\n";
  gameLoop();
}
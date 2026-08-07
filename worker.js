const NAMES = ["林默","江澈","沈舟","苏离","陈屿","陆沉","白棠"];
const EVENTS = [
  {t:"暴风雨", bad:true, d:"海风裹着雨砸下来，营地被掀开一角"},
  {t:"烈日", bad:true, d:"太阳毒辣，晒得人发晕"},
  {t:"野猪", bad:true, d:"一头野猪在灌木丛边拱来拱去"},
  {t:"退潮", d:"潮水退去，礁石间露出贝壳和海草"},
  {t:"晴天", d:"风平浪静，是个好天气"},
  {t:"椰子树", d:"不远处的礁石缝里长着几棵椰子树"},
  {t:"海鸥", d:"几只海鸥落在沙滩上啄食"},
  {t:"旧木箱", d:"潮水冲上来一只半埋的旧木箱"}
];

function pick(a){ return a[Math.floor(Math.random()*a.length)]; }

function judge(action){
  const a = action || "";
  if(a.includes("水")) return {w:2, f:1, msg:"找到了淡水，还摘了点椰肉。"};
  if(a.includes("椰")||a.includes("鱼")||a.includes("果")||a.includes("贝")||a.includes("食")) return {f:2, msg:"补充了食物，肚子不饿了。"};
  if(a.includes("休息")||a.includes("睡觉")||a.includes("睡")) return {t:3, msg:"睡了一觉，体力恢复。"};
  if(a.includes("探索")||a.includes("侦察")||a.includes("搜寻")||a.includes("找")) {
    const r = Math.random();
    if(r<0.4) return {w:1,f:1,t:1,msg:"探索有收获：淡水和野果。"};
    if(r<0.7) return {t:-2,msg:"走远了差点迷路，消耗体力。"};
    return {w:2, msg:"发现一小片淡水洼地！"};
  }
  if(a.includes("建")||a.includes("木筏")||a.includes("信号")||a.includes("求救")||a.toLowerCase().includes("sos")) return {p:2,t:-1,msg:"搭建求生设施，进度推进。"};
  if(a.includes("疗伤")||a.includes("草药")||a.includes("包扎")) return {t:2,msg:"处理了伤口，状态好转。"};
  if(a.includes("发呆")||a.includes("不动")) return {t:1,msg:"什么都没做，放空了一下。"};
  return {t:-1, msg:"行动没有明显效果。"};
}

function encodeState(hp, ni, day){
  return [ni, day, hp.w, hp.f, hp.t, hp.p].join("|");
}

function parseState(s){
  const p = (s||"").split("|").map(Number);
  return {ni: p[0]||0, day: p[1]||1, w: p[2]||5, f: p[3]||5, t: p[4]||5, p: p[5]||0};
}

export default {
  async fetch(request){
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const stateRaw = url.searchParams.get("state");
    const base = url.origin + url.pathname;
    const text = (s) => new Response(s, {headers:{"content-type":"text/plain;charset=utf-8"}});

    if(!stateRaw){
      const ni = Math.floor(Math.random()*NAMES.length);
      const ev = pick(EVENTS);
      const lines = [];
      lines.push("=== 荒岛求生 · 第1天 · "+NAMES[ni]+" ===");
      lines.push(ev.t+"："+ev.d);
      lines.push("状态：水5/10 食物5/10 体力5/10 求生进度0/20");
      lines.push("");
      lines.push("你醒来在荒岛上，请决定今天做什么。");
      lines.push("开始："+base+"?state="+encodeState({w:5,f:5,t:5,p:0}, ni, 1)+"&action=你的行动");
      return text(lines.join("\n"));
    }

    const st = parseState(stateRaw);
    const name = NAMES[st.ni] || NAMES[0];
    let hp = {w:st.w, f:st.f, t:st.t, p:st.p};
    const res = judge(action);
    hp.w = Math.max(0, Math.min(10, hp.w+(res.w||0)));
    hp.f = Math.max(0, Math.min(10, hp.f+(res.f||0)));
    hp.t = Math.max(0, Math.min(10, hp.t+(res.t||0)));
    hp.p = Math.min(20, hp.p+(res.p||0));

    if(hp.w<=0||hp.f<=0||hp.t<=0){
      return text(name+"在"+(hp.w<=0?"缺水":hp.f<=0?"断粮":"体力耗尽")+"中倒下了。游戏结束。");
    }
    if(hp.p>=20){
      return text(name+"完成了木筏，驶向大海，获救！游戏结束。");
    }
    if(st.day>=10){
      const end = hp.p>=15 ? "救援队经过，被信号吸引，获救。" : "信号太弱，"+name+"继续留在荒岛上等待。";
      return text("第10天结束。"+end+" 游戏结束。");
    }

    const nextDay = st.day+1;
    const ev = pick(EVENTS);
    const wc = ev.bad?2:1, fc = ev.bad?2:1;
    hp.w -= wc; hp.f -= fc; hp.t -= 1;
    if(hp.w<=0||hp.f<=0||hp.t<=0){
      const lines = [];
      lines.push("=== 荒岛求生 · 第"+nextDay+"天 · "+name+" ===");
      lines.push(ev.t+"："+ev.d);
      lines.push("你的行动："+(action||"无")+" → "+(res.msg||""));
      lines.push(name+"在"+(hp.w<=0?"缺水":hp.f<=0?"断粮":"体力耗尽")+"中倒下了。游戏结束。");
      return text(lines.join("\n"));
    }

    const lines = [];
    lines.push("=== 荒岛求生 · 第"+nextDay+"天 · "+name+" ===");
    lines.push(ev.t+"："+ev.d);
    lines.push("你的行动："+(action||"无")+" → "+(res.msg||""));
    lines.push("状态：水"+hp.w+"/10 食物"+hp.f+"/10 体力"+hp.t+"/10 求生进度"+hp.p+"/20");
    lines.push("");
    lines.push("请决定第"+nextDay+"天的行动。");
    lines.push("继续："+base+"?state="+encodeState(hp, st.ni, nextDay)+"&action=你的行动");
    return text(lines.join("\n"));
  }
};

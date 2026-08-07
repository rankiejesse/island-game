// ---------- 初始化画布 ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreSpan = document.getElementById('scoreNum');
const statusSpan = document.getElementById('status');

let W, H;
function resizeCanvas() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ---------- Matter.js 引擎 ----------
const { Engine, World, Bodies, Body, Events, Vector } = Matter;
const engine = Engine.create({
    gravity: { x: 0, y: 1.2 }
});
const world = engine.world;

// ---------- 游戏常量 ----------
const SLING_X = W * 0.2;          // 弹弓位置 (左1/5处)
const SLING_Y = H * 0.75;
const MAX_DRAG = 80;              // 最大拖拽距离 (像素)
const LAUNCH_POWER = 0.22;        // 发射力度系数

let currentBird = null;           // 当前小鸟 Body
let birdsRemaining = 3;           // 剩余小鸟数量
let score = 0;
let isDragging = false;
let dragStartPos = { x: 0, y: 0 };

// 存储动态物体(用于重置)
let dynamicBodies = [];

// ---------- 工具：创建带样式的物体 ----------
function createBird(x, y) {
    const body = Bodies.circle(x, y, 22, {
        label: 'bird',
        friction: 0.5,
        restitution: 0.4,
        density: 0.002
    });
    body.render = { fillStyle: '#e74c3c' };
    return body;
}

function createPig(x, y) {
    const body = Bodies.circle(x, y, 18, {
        label: 'pig',
        friction: 0.5,
        restitution: 0.2,
        density: 0.003
    });
    body.render = { fillStyle: '#2ecc71' };
    return body;
}

function createBlock(x, y, w, h, color = '#d4a373') {
    const body = Bodies.rectangle(x, y, w, h, {
        label: 'block',
        friction: 0.6,
        restitution: 0.1,
        density: 0.005
    });
    body.render = { fillStyle: color };
    return body;
}

// ---------- 搭建关卡 ----------
function buildLevel() {
    // 清理旧物体 (保留地面和墙壁)
    const toRemove = dynamicBodies.filter(b => b.label !== 'ground' && b.label !== 'wall');
    World.remove(world, toRemove);
    dynamicBodies = dynamicBodies.filter(b => b.label === 'ground' || b.label === 'wall');

    // 1. 地面 (宽大)
    const ground = Bodies.rectangle(W / 2, H + 20, W + 100, 60, {
        label: 'ground',
        isStatic: true,
        friction: 0.8,
        restitution: 0.1
    });
    ground.render = { fillStyle: '#4a7c59' };

    // 2. 左侧墙壁 (防止飞出左边)
    const wall = Bodies.rectangle(-30, H / 2, 60, H * 2, {
        label: 'wall',
        isStatic: true,
        friction: 0.5,
        restitution: 0.3
    });
    wall.render = { fillStyle: '#2d3436' };

    World.add(world, [ground, wall]);
    dynamicBodies.push(ground, wall);

    // 3. 右侧建筑群 (小猪 + 木块/石块的混合结构)
    const baseX = W * 0.7;
    const baseY = H * 0.78;

    // 底层 - 3个宽木块
    const b1 = createBlock(baseX - 60, baseY, 40, 20, '#c68c5c');
    const b2 = createBlock(baseX, baseY, 40, 20, '#c68c5c');
    const b3 = createBlock(baseX + 60, baseY, 40, 20, '#c68c5c');
    // 中间小猪
    const pig1 = createPig(baseX, baseY - 40);
    // 第二层 - 横梁
    const beam = createBlock(baseX, baseY - 70, 120, 16, '#b57c4a');
    // 第二层两侧竖块
    const b4 = createBlock(baseX - 45, baseY - 100, 20, 40, '#a67c52');
    const b5 = createBlock(baseX + 45, baseY - 100, 20, 40, '#a67c52');
    // 顶层小猪
    const pig2 = createPig(baseX, baseY - 125);
    // 顶层遮挡小方块(装饰)
    const top = createBlock(baseX, baseY - 145, 40, 15, '#8b6b41');

    const blocks = [b1, b2, b3, beam, b4, b5, top];
    const pigs = [pig1, pig2];

    World.add(world, [...blocks, ...pigs]);
    dynamicBodies.push(...blocks, ...pigs);

    // 4. 创建弹弓上的小鸟
    createNewBird();
}

// ---------- 生成新小鸟 ----------
function createNewBird() {
    if (currentBird) {
        World.remove(world, currentBird);
        currentBird = null;
    }
    if (birdsRemaining <= 0) {
        statusSpan.innerText = '😵 小鸟用完了！点"重来"';
        return;
    }

    const bird = createBird(SLING_X, SLING_Y);
    bird.isStatic = true;          // 初始固定在弹弓上
    World.add(world, bird);
    dynamicBodies.push(bird);
    currentBird = bird;
    statusSpan.innerText = `🐦 剩余 ${birdsRemaining} 只 · 拖拽发射`;
}

// ---------- 重置游戏 ----------
function resetGame() {
    // 移除所有动态物体
    const allBodies = [...dynamicBodies];
    World.remove(world, allBodies);
    dynamicBodies = [];
    currentBird = null;
    birdsRemaining = 3;
    score = 0;
    updateScore();
    isDragging = false;
    buildLevel();
    statusSpan.innerText = '🔄 已重置，拖拽小鸟发射';
}

// ---------- 更新分数 UI ----------
function updateScore() {
    scoreSpan.textContent = score;
}

// ---------- 碰撞检测 (小鸟撞击小猪) ----------
Events.on(engine, 'collisionStart', (event) => {
    for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        // 检查是否是小鸟撞小猪
        let bird = null, pig = null;
        if (bodyA.label === 'bird' && bodyB.label === 'pig') {
            bird = bodyA; pig = bodyB;
        } else if (bodyB.label === 'bird' && bodyA.label === 'pig') {
            bird = bodyB; pig = bodyA;
        }

        if (bird && pig) {
            // 移除小猪 (加上一点延迟动画效果，直接移除)
            World.remove(world, pig);
            const idx = dynamicBodies.indexOf(pig);
            if (idx > -1) dynamicBodies.splice(idx, 1);
            score += 10;
            updateScore();
            statusSpan.innerText = '💥 击中！ +10分';
            // 播放震动反馈 (可选)
            if (navigator.vibrate) navigator.vibrate(30);
        }
    }
});

// ---------- 触摸 / 鼠标 事件 ----------
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
        e.preventDefault();
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

function onPointerDown(e) {
    e.preventDefault();
    if (!currentBird || currentBird.isStatic === false) return;

    const pos = getPos(e);
    const dx = pos.x - SLING_X;
    const dy = pos.y - SLING_Y;
    // 判断手指是否点在小鸟附近 (半径50px)
    if (Math.sqrt(dx * dx + dy * dy) < 50) {
        isDragging = true;
        dragStartPos = { x: pos.x, y: pos.y };
        statusSpan.innerText = '🎯 瞄准中...';
    }
}

function onPointerMove(e) {
    e.preventDefault();
    if (!isDragging || !currentBird) return;

    const pos = getPos(e);
    let dx = pos.x - SLING_X;
    let dy = pos.y - SLING_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 限制最大拖拽距离 (橡皮筋效果)
    if (dist > MAX_DRAG) {
        dx = (dx / dist) * MAX_DRAG;
        dy = (dy / dist) * MAX_DRAG;
    }
    // 不允许拖到弹弓右边 (防止反方向发射)
    if (dx > 0) {
        dx = 0;
    }
    // 更新小鸟位置 (锁定在弹弓上，跟随手指)
    Body.setPosition(currentBird, { x: SLING_X + dx, y: SLING_Y + dy });
    Body.setVelocity(currentBird, { x: 0, y: 0 });
    currentBird.isStatic = true; // 拖拽过程中保持静止
}

function onPointerUp(e) {
    e.preventDefault();
    if (!isDragging || !currentBird) {
        isDragging = false;
        return;
    }

    isDragging = false;
    const pos = getPos(e);
    let dx = pos.x - SLING_X;
    let dy = pos.y - SLING_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 如果拖拽距离太小 (小于10px) 当作取消发射
    if (dist < 10) {
        Body.setPosition(currentBird, { x: SLING_X, y: SLING_Y });
        statusSpan.innerText = '👆 拖远一点再松手';
        return;
    }

    // 限制最大距离以计算速度
    let limitedDx = dx, limitedDy = dy;
    if (dist > MAX_DRAG) {
        limitedDx = (dx / dist) * MAX_DRAG;
        limitedDy = (dy / dist) * MAX_DRAG;
    }

    // 计算发射速度 (反向 * 力度系数)
    const velocity = {
        x: -limitedDx * LAUNCH_POWER,
        y: -limitedDy * LAUNCH_POWER
    };

    // 释放小鸟
    currentBird.isStatic = false;
    Body.setVelocity(currentBird, velocity);
    Body.setAngularVelocity(currentBird, 0.05);

    statusSpan.innerText = '🚀 小鸟飞出去啦！';
    birdsRemaining--;

    // 2秒后检查小鸟是否静止或飞出，生成下一只
    setTimeout(() => {
        if (currentBird) {
            const v = currentBird.velocity;
            const speed = Math.sqrt(v.x * v.x + v.y * v.y);
            // 如果速度很慢或者飞出边界，就回收
            if (speed < 0.5 || currentBird.position.y > H + 100 || currentBird.position.x > W + 100) {
                World.remove(world, currentBird);
                const idx = dynamicBodies.indexOf(currentBird);
                if (idx > -1) dynamicBodies.splice(idx, 1);
                currentBird = null;
                createNewBird();
            }
        }
    }, 2500);

    // 保险: 10秒后强制重置小鸟状态
    setTimeout(() => {
        if (currentBird && currentBird.isStatic === false) {
            World.remove(world, currentBird);
            const idx = dynamicBodies.indexOf(currentBird);
            if (idx > -1) dynamicBodies.splice(idx, 1);
            currentBird = null;
            createNewBird();
        }
    }, 10000);
}

// 绑定事件 (同时支持鼠标和触摸)
canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('touchmove', onPointerMove, { passive: false });
canvas.addEventListener('touchend', onPointerUp, { passive: false });

// 重置按钮
document.getElementById('resetBtn').addEventListener('click', resetGame);
document.getElementById('resetBtn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    resetGame();
});

// ---------- 自定义渲染循环 (绘制图形) ----------
function draw() {
    ctx.clearRect(0, 0, W, H);

    // 绘制草地 (简单装饰)
    ctx.fillStyle = '#7cc46c';
    ctx.fillRect(0, H * 0.85, W, H * 0.15);

    // 绘制弹弓支架 (两个叉)
    ctx.strokeStyle = '#4a2c1a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    // 左叉
    ctx.beginPath();
    ctx.moveTo(SLING_X - 12, SLING_Y - 10);
    ctx.lineTo(SLING_X - 8, SLING_Y - 45);
    ctx.stroke();
    // 右叉
    ctx.beginPath();
    ctx.moveTo(SLING_X + 12, SLING_Y - 10);
    ctx.lineTo(SLING_X + 8, SLING_Y - 45);
    ctx.stroke();
    // 底座
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.arc(SLING_X, SLING_Y + 6, 14, 0, Math.PI * 2);
    ctx.fill();

    // 绘制橡皮筋 (拖拽时)
    if (isDragging && currentBird) {
        const bx = currentBird.position.x;
        const by = currentBird.position.y;
        ctx.strokeStyle = '#2d1b0e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(SLING_X - 10, SLING_Y - 40);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(SLING_X + 10, SLING_Y - 40);
        ctx.lineTo(bx, by);
        ctx.stroke();

        // 绘制瞄准轨迹 (虚线预测)
        const dx = SLING_X - bx;
        const dy = SLING_Y - by;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
            const power = Math.min(dist / MAX_DRAG, 1) * 15;
            const angle = Math.atan2(dy, dx);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 8]);
            ctx.beginPath();
            for (let t = 0; t < 1; t += 0.04) {
                const px = bx + dx * power * t * 0.5;
                const py = by + dy * power * t * 0.5 + 0.5 * 980 * 0.001 * t * t * 60;
                if (t === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // 遍历并绘制所有物理物体
    const allBodies = world.bodies;
    for (const body of allBodies) {
        const vertices = body.vertices;
        if (!vertices) continue;

        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();

        // 根据标签上色
        let fill = '#aaa', stroke = '#333';
        if (body.label === 'bird') {
            fill = '#e74c3c';
            stroke = '#c0392b';
        } else if (body.label === 'pig') {
            fill = '#2ecc71';
            stroke = '#27ae60';
            // 画猪鼻子 (点在中心)
            ctx.fillStyle = '#1e8449';
            ctx.beginPath();
            ctx.arc(body.position.x - 5, body.position.y - 3, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(body.position.x + 5, body.position.y - 3, 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (body.label === 'ground' || body.label === 'wall') {
            fill = (body.label === 'ground') ? '#4a7c59' : '#2d3436';
            stroke = '#1e3d2b';
        } else {
            fill = body.render?.fillStyle || '#d4a373';
            stroke = '#8b6b41';
        }

        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 画小鸟的眼睛
        if (body.label === 'bird') {
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(body.position.x - 8, body.position.y - 5, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(body.position.x + 8, body.position.y - 5, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1a1a2e';
            ctx.beginPath();
            ctx.arc(body.position.x - 6, body.position.y - 7, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(body.position.x + 10, body.position.y - 7, 3, 0, Math.PI * 2);
            ctx.fill();
            // 嘴巴 (三角形)
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.moveTo(body.position.x, body.position.y + 4);
            ctx.lineTo(body.position.x - 8, body.position.y + 12);
            ctx.lineTo(body.position.x + 8, body.position.y + 12);
            ctx.closePath();
            ctx.fill();
        }
    }

    // 显示剩余小鸟数 (右上角绘制小鸟图标)
    ctx.font = '24px Arial';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText('🐦 x ' + birdsRemaining, W - 80, 50);

    requestAnimationFrame(draw);
}

// ---------- 更新物理循环 (独立运行) ----------
function updatePhysics() {
    Engine.update(engine, 1000 / 60);
    requestAnimationFrame(updatePhysics);
}

// ---------- 启动游戏 ----------
buildLevel();
draw();
updatePhysics();

// 适配窗口变化重置画布尺寸
window.addEventListener('resize', () => {
    resizeCanvas();
    // 注意: 物理坐标不会变，但为了体验，不重置游戏，只是画布拉伸
});
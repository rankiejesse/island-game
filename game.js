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

// ---------- Matter.js 引擎 (增加迭代次数防止结构崩塌) ----------
const { Engine, World, Bodies, Body, Events, Vector } = Matter;
const engine = Engine.create({
    gravity: { x: 0, y: 1.5 }
});
// 关键修复：提高迭代精度，建筑就不会自己倒了
engine.positionIterations = 15;
engine.velocityIterations = 10;
const world = engine.world;

// ---------- 游戏常量 ----------
const SLING_X = W * 0.2;
const SLING_Y = H * 0.75;
const MAX_DRAG = 90;
const LAUNCH_POWER = 0.25;

let currentBird = null;
let birdsRemaining = 4;
let score = 0;
let isDragging = false;
let dynamicBodies = [];

// ---------- 工具函数：获取精确触摸/鼠标位置 (修复touchend取不到坐标的Bug) ----------
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
        // 触摸移动/开始
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        // 关键修复：触摸结束(touchend)时用 changedTouches
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else {
        // 鼠标事件
        clientX = e.clientX;
        clientY = e.clientY;
    }

    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

// ---------- 创建物体 ----------
function createBird(x, y) {
    const body = Bodies.circle(x, y, 20, {
        label: 'bird',
        friction: 0.8,
        restitution: 0.05, // 减小弹性，防止乱弹
        density: 0.002,
        circleRadius: 20
    });
    return body;
}

function createPig(x, y) {
    const body = Bodies.circle(x, y, 16, {
        label: 'pig',
        friction: 0.8,
        restitution: 0.05,
        density: 0.003,
        circleRadius: 16
    });
    return body;
}

function createBlock(x, y, w, h, color = '#d4a373') {
    const body = Bodies.rectangle(x, y, w, h, {
        label: 'block',
        friction: 0.9,
        restitution: 0.02,
        density: 0.005
    });
    body.render = { fillStyle: color };
    return body;
}

// ---------- 搭建稳固关卡 (调整高度让建筑稳稳落地) ----------
function buildLevel() {
    const toRemove = [...dynamicBodies];
    World.remove(world, toRemove);
    dynamicBodies = [];

    // 1. 地面 (直接放在画布底部)
    const ground = Bodies.rectangle(W / 2, H + 10, W + 200, 60, {
        label: 'ground',
        isStatic: true,
        friction: 0.9,
        restitution: 0
    });
    World.add(world, ground);
    dynamicBodies.push(ground);

    // 2. 左右墙壁 (防止飞出)
    const wallL = Bodies.rectangle(-30, H / 2, 60, H * 2, {
        label: 'wall',
        isStatic: true,
        friction: 0.5,
        restitution: 0
    });
    const wallR = Bodies.rectangle(W + 30, H / 2, 60, H * 2, {
        label: 'wall',
        isStatic: true,
        friction: 0.5,
        restitution: 0
    });
    World.add(world, [wallL, wallR]);
    dynamicBodies.push(wallL, wallR);

    // 3. 建筑群 (坐标重新计算，确保底部刚好接触地面，不会悬空摔散)
    const baseX = W * 0.7;
    const baseY = H - 70; // 直接贴地（地面顶部在 H-20 左右）

    // 底层：3个宽扁木桩
    const b1 = createBlock(baseX - 55, baseY, 34, 18, '#c68c5c');
    const b2 = createBlock(baseX, baseY, 34, 18, '#c68c5c');
    const b3 = createBlock(baseX + 55, baseY, 34, 18, '#c68c5c');
    // 中间小猪 (落地)
    const pig1 = createPig(baseX, baseY - 30);
    // 横梁
    const beam = createBlock(baseX, baseY - 55, 130, 14, '#b57c4a');
    // 第二层立柱
    const b4 = createBlock(baseX - 40, baseY - 80, 16, 34, '#a67c52');
    const b5 = createBlock(baseX + 40, baseY - 80, 16, 34, '#a67c52');
    // 顶层小猪
    const pig2 = createPig(baseX, baseY - 105);
    // 顶层遮雨棚
    const top = createBlock(baseX, baseY - 120, 60, 12, '#8b6b41');

    const blocks = [b1, b2, b3, beam, b4, b5, top];
    const pigs = [pig1, pig2];

    World.add(world, [...blocks, ...pigs]);
    dynamicBodies.push(...blocks, ...pigs);

    // 4. 生成初始小鸟
    createNewBird();
}

// ---------- 生成新小鸟 ----------
function createNewBird() {
    if (currentBird) {
        World.remove(world, currentBird);
        currentBird = null;
    }
    if (birdsRemaining <= 0) {
        statusSpan.innerText = '😵 没小鸟了！点"重来"';
        return;
    }

    const bird = createBird(SLING_X, SLING_Y);
    bird.isStatic = true;
    World.add(world, bird);
    dynamicBodies.push(bird);
    currentBird = bird;
    statusSpan.innerText = `🐦 剩余 ${birdsRemaining} 只 · 拖拽发射`;
}

// ---------- 重置 ----------
function resetGame() {
    const allBodies = [...dynamicBodies];
    World.remove(world, allBodies);
    dynamicBodies = [];
    currentBird = null;
    birdsRemaining = 4;
    score = 0;
    updateScore();
    isDragging = false;
    buildLevel();
    statusSpan.innerText = '🔄 已重置';
}

function updateScore() {
    scoreSpan.textContent = score;
}

// ---------- 碰撞检测 ----------
Events.on(engine, 'collisionStart', (event) => {
    for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        let bird = null, pig = null;
        if (bodyA.label === 'bird' && bodyB.label === 'pig') {
            bird = bodyA; pig = bodyB;
        } else if (bodyB.label === 'bird' && bodyA.label === 'pig') {
            bird = bodyB; pig = bodyA;
        }
        if (bird && pig) {
            World.remove(world, pig);
            const idx = dynamicBodies.indexOf(pig);
            if (idx > -1) dynamicBodies.splice(idx, 1);
            score += 10;
            updateScore();
            statusSpan.innerText = '💥 击中！ +10分';
            if (navigator.vibrate) navigator.vibrate(30);
        }
    }
});

// ---------- 事件绑定 (修复拖拽发射) ----------
function onPointerDown(e) {
    e.preventDefault();
    if (!currentBird || !currentBird.isStatic) return;

    const pos = getPos(e);
    const dx = pos.x - SLING_X;
    const dy = pos.y - SLING_Y;
    if (Math.sqrt(dx * dx + dy * dy) < 60) {
        isDragging = true;
        statusSpan.innerText = '🎯 瞄准...';
    }
}

function onPointerMove(e) {
    e.preventDefault();
    if (!isDragging || !currentBird) return;

    const pos = getPos(e);
    let dx = pos.x - SLING_X;
    let dy = pos.y - SLING_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > MAX_DRAG) {
        dx = (dx / dist) * MAX_DRAG;
        dy = (dy / dist) * MAX_DRAG;
    }
    if (dx > 0) dx = 0; // 只准向后拉

    Body.setPosition(currentBird, { x: SLING_X + dx, y: SLING_Y + dy });
    Body.setVelocity(currentBird, { x: 0, y: 0 });
    currentBird.isStatic = true;
}

function onPointerUp(e) {
    e.preventDefault();
    if (!isDragging || !currentBird) {
        isDragging = false;
        return;
    }

    isDragging = false;
    const pos = getPos(e); // 这里修复了！现在能正确拿到手指松开的位置

    let dx = pos.x - SLING_X;
    let dy = pos.y - SLING_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 15) {
        Body.setPosition(currentBird, { x: SLING_X, y: SLING_Y });
        statusSpan.innerText = '👆 拉远一点再松手';
        return;
    }

    if (dist > MAX_DRAG) {
        dx = (dx / dist) * MAX_DRAG;
        dy = (dy / dist) * MAX_DRAG;
    }

    // 计算发射速度
    const velocity = {
        x: -dx * LAUNCH_POWER,
        y: -dy * LAUNCH_POWER
    };

    currentBird.isStatic = false;
    Body.setVelocity(currentBird, velocity);

    statusSpan.innerText = '🚀 发射！';
    birdsRemaining--;

    // 自动回收并生成下一只
    setTimeout(() => {
        if (currentBird) {
            const v = currentBird.velocity;
            const speed = Math.sqrt(v.x * v.x + v.y * v.y);
            if (speed < 0.5 || currentBird.position.y > H + 100 || currentBird.position.x > W + 100) {
                World.remove(world, currentBird);
                const idx = dynamicBodies.indexOf(currentBird);
                if (idx > -1) dynamicBodies.splice(idx, 1);
                currentBird = null;
                createNewBird();
            }
        }
    }, 2000);

    // 10秒强制回收
    setTimeout(() => {
        if (currentBird && !currentBird.isStatic) {
            World.remove(world, currentBird);
            const idx = dynamicBodies.indexOf(currentBird);
            if (idx > -1) dynamicBodies.splice(idx, 1);
            currentBird = null;
            createNewBird();
        }
    }, 8000);
}

// 绑定事件
canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('touchmove', onPointerMove, { passive: false });
canvas.addEventListener('touchend', onPointerUp, { passive: false });

document.getElementById('resetBtn').addEventListener('click', resetGame);
document.getElementById('resetBtn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    resetGame();
});

// ---------- 绘图循环 (修复眼睛显示) ----------
function draw() {
    ctx.clearRect(0, 0, W, H);

    // 天空渐变
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#4facfe');
    grad.addColorStop(1, '#e0f2fe');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 草地
    ctx.fillStyle = '#7cc46c';
    ctx.fillRect(0, H - 30, W, 30);

    // 弹弓
    ctx.strokeStyle = '#4a2c1a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(SLING_X - 12, SLING_Y - 10);
    ctx.lineTo(SLING_X - 8, SLING_Y - 45);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(SLING_X + 12, SLING_Y - 10);
    ctx.lineTo(SLING_X + 8, SLING_Y - 45);
    ctx.stroke();
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.arc(SLING_X, SLING_Y + 6, 14, 0, Math.PI * 2);
    ctx.fill();

    // 橡皮筋
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

        // 轨迹预测
        const dx = SLING_X - bx;
        const dy = SLING_Y - by;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
            const power = Math.min(dist / MAX_DRAG, 1) * 16;
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 8]);
            ctx.beginPath();
            for (let t = 0; t < 1; t += 0.04) {
                const px = bx + dx * power * t * 0.4;
                const py = by + dy * power * t * 0.4 + 0.5 * 980 * 0.001 * t * t * 70;
                if (t === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // 绘制所有物理物体
    for (const body of world.bodies) {
        const verts = body.vertices;
        if (!verts || body.label === 'ground' || body.label === 'wall') continue;

        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath();

        let fill = '#aaa', stroke = '#555';
        if (body.label === 'bird') {
            fill = '#e74c3c'; stroke = '#c0392b';
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2;
            ctx.stroke();
            // 眼睛
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(body.position.x - 6, body.position.y - 4, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(body.position.x + 6, body.position.y - 4, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1a1a2e';
            ctx.beginPath();
            ctx.arc(body.position.x - 4, body.position.y - 6, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(body.position.x + 8, body.position.y - 6, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // 嘴巴
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.moveTo(body.position.x, body.position.y + 3);
            ctx.lineTo(body.position.x - 6, body.position.y + 10);
            ctx.lineTo(body.position.x + 6, body.position.y + 10);
            ctx.closePath();
            ctx.fill();
            continue;
        }
        if (body.label === 'pig') {
            fill = '#2ecc71'; stroke = '#27ae60';
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2;
            ctx.stroke();
            // 猪鼻孔
            ctx.fillStyle = '#1e8449';
            ctx.beginPath();
            ctx.arc(body.position.x - 4, body.position.y - 2, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(body.position.x + 4, body.position.y - 2, 3, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }
        // 木块
        ctx.fillStyle = body.render?.fillStyle || '#d4a373';
        ctx.fill();
        ctx.strokeStyle = '#8b6b41';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText('🐦 x ' + Math.max(0, birdsRemaining), W - 90, 45);

    requestAnimationFrame(draw);
}

// ---------- 物理更新 ----------
function updatePhysics() {
    Engine.update(engine, 1000 / 60);
    requestAnimationFrame(updatePhysics);
}

// ---------- 启动 ----------
buildLevel();
draw();
updatePhysics();

window.addEventListener('resize', () => {
    resizeCanvas();
});
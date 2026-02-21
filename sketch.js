const { Engine, World, Bodies, Body, Constraint, Mouse, MouseConstraint, Composite } = Matter;

let engine, world;
let pendulums = []; // { body, constraint, defaultColor, massRatio }
let canvas;
let draggingBody = null;

// UI State
let numPendulums = 5;
let hasGap = false;
let isUniformMass = true;
let individualMasses = [];

const BOB_RADIUS = 25;
const STRING_LENGTH = 250;
const PIVOT_Y = 100;
const BASE_MASS = 1;

function setup() {
    const container = document.getElementById('canvas-container');
    canvas = createCanvas(container.offsetWidth, container.offsetHeight);
    canvas.parent(container);

    engine = Engine.create();
    world = engine.world;
    // 摩擦や空気抵抗を極力減らす
    engine.gravity.y = 1;

    // UIのイベントリスナー設定
    setupUI();

    // 初期化
    createCradle();
}

function mousePressed() {
    for (let i = 0; i < pendulums.length; i++) {
        let p = pendulums[i];
        let pos = p.body.position;
        let d = dist(mouseX, mouseY, pos.x, pos.y);
        // 玉をクリックしたか判定
        if (d < p.radius * 1.5) {
            draggingBody = p.body;
            // ドラッグ中のみ物理演算の影響を受けないようにする
            Body.setStatic(draggingBody, true);
            break;
        }
    }
}

function mouseDragged() {
    if (draggingBody) {
        // 対象の振り子の情報を探す
        let pInfo = pendulums.find(p => p.body === draggingBody);
        if (pInfo) {
            let pivot = pInfo.constraint.pointA;
            let dx = mouseX - pivot.x;
            let dy = mouseY - pivot.y;
            let angle = Math.atan2(dy, dx);

            // 紐がピンと張った状態を維持する（長さを固定）
            let newX = pivot.x + Math.cos(angle) * STRING_LENGTH;
            let newY = pivot.y + Math.sin(angle) * STRING_LENGTH;

            Body.setPosition(draggingBody, { x: newX, y: newY });
        }
    }
}

function mouseReleased() {
    if (draggingBody) {
        // ドラッグ終了で物理演算を再開
        Body.setStatic(draggingBody, false);
        // 手を離した瞬間の速度はゼロにし、純粋に重力で落下させる
        Body.setVelocity(draggingBody, { x: 0, y: 0 });
        draggingBody = null;
    }
}

function setupUI() {
    // 振り子の数
    const numSlider = document.getElementById('numPendulums');
    const numSpan = document.getElementById('numVal');
    numSlider.addEventListener('input', (e) => {
        numPendulums = parseInt(e.target.value);
        numSpan.innerText = numPendulums;
        ensureIndividualMassArray();
        renderIndividualMassControls();
        createCradle();
    });

    // 隙間
    const gapCheck = document.getElementById('hasGap');
    gapCheck.addEventListener('change', (e) => {
        hasGap = e.target.checked;
        createCradle();
    });

    // 質量の設定モード
    const massRadios = document.querySelectorAll('input[name="massMode"]');
    const massControlsContainer = document.getElementById('individualMassControls');

    massRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            isUniformMass = (e.target.value === 'uniform');
            if (isUniformMass) {
                massControlsContainer.classList.add('hidden');
            } else {
                massControlsContainer.classList.remove('hidden');
                ensureIndividualMassArray();
                renderIndividualMassControls();
            }
            createCradle();
        });
    });

    // リセットボタン
    document.getElementById('resetBtn').addEventListener('click', () => {
        createCradle();
    });

    // 初期データ準備
    ensureIndividualMassArray();
}

function ensureIndividualMassArray() {
    // 現在の振り子数に合わせて配列サイズを維持
    if (individualMasses.length < numPendulums) {
        for (let i = individualMasses.length; i < numPendulums; i++) {
            individualMasses.push(BASE_MASS); // デフォルト1
        }
    }
}

function renderIndividualMassControls() {
    const container = document.getElementById('individualMassControls');
    container.innerHTML = '';

    for (let i = 0; i < numPendulums; i++) {
        const row = document.createElement('div');
        row.className = 'individual-mass-row';
        row.innerHTML = `
            <span>玉 ${i + 1}: </span>
            <input type="range" class="mass-slider" data-index="${i}" min="0.5" max="3" step="0.1" value="${individualMasses[i]}">
        `;
        container.appendChild(row);
    }

    // スライダーのイベントリスナー
    const sliders = container.querySelectorAll('.mass-slider');
    sliders.forEach(slider => {
        slider.addEventListener('input', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            individualMasses[index] = parseFloat(e.target.value);
            createCradle(); // スライダー動かす度に再生成
        });
    });
}

function createCradle() {
    // 既存のオブジェクトを消去
    World.clear(world, true);
    pendulums = [];

    // 固定用の天井みたいなもの（見た目）
    const pivotBaseY = PIVOT_Y;

    // 隙間設定
    // ニュートンのゆりかごをシミュレーションエンジンで正しく動かすには微小な隙間が必要
    // 完全に隙間がない(0)と、複数の球が一体とみなされて力が正しく伝わらない現象が起きる
    const diameter = BOB_RADIUS * 2;
    // hasGap が false のときは隙間なし（シミュレーション失敗する例）
    // hasGap が true のときは微小な隙間（シミュレーション成功する例）
    const gap = hasGap ? 0.01 : 0;
    const spacing = diameter + gap;

    // 中央に配置するためのオフセット計算
    const totalWidth = spacing * (numPendulums - 1);
    const startX = width / 2 - totalWidth / 2;

    for (let i = 0; i < numPendulums; i++) {
        const x = startX + i * spacing;

        // 質量設定
        const massRatio = isUniformMass ? BASE_MASS : individualMasses[i];

        // 質量の違いを見た目で分かるように半径を少し変える（面積が質量に比例すると仮定）
        const radius = isUniformMass ? BOB_RADIUS : BOB_RADIUS * Math.sqrt(massRatio);

        const body = Bodies.circle(x, pivotBaseY + STRING_LENGTH, radius, {
            restitution: 1.0,    // 1.0で完全弾性衝突。力を100%伝える
            friction: 0.0,       // 摩擦なし
            frictionAir: 0.0,    // 空気抵抗なし
            frictionStatic: 0.0,
            slop: 0.0,           // オブジェクトのめり込みを許容しない（運動量伝達に極めて重要）
            inertia: Infinity,   // 回転させない
            mass: massRatio * 10 // 重さ
        });

        // 紐（制約）。stiffnessを1にして伸び縮みしないようにする
        const constraint = Constraint.create({
            pointA: { x: x, y: pivotBaseY },
            bodyB: body,
            pointB: { x: 0, y: 0 },
            stiffness: 1.0,
            length: STRING_LENGTH,
            render: { visible: false }
        });

        // 描画用の色を設定。質量が違うと色を変えると分かりやすい
        let rColor, gColor, bColor;
        if (isUniformMass) {
            rColor = 28; gColor = 176; bColor = 246; // Accent blue
        } else {
            // パステルカラー的にばらけさせる
            colorMode(HSB, 360, 100, 100);
            let c = color((i * 40) % 360, 60, 90);
            colorMode(RGB, 255);
            rColor = red(c); gColor = green(c); bColor = blue(c);
        }

        World.add(world, [body, constraint]);
        pendulums.push({ body, constraint, r: rColor, g: gColor, b: bColor, radius: radius });
    }
}

function draw() {
    background('#f7f9fa'); // Duolingo UI top background match
    Engine.update(engine);

    strokeCap(ROUND);

    // 天井（梁）を描画
    stroke('#e5e5e5');
    strokeWeight(12);
    line(width / 2 - ((BOB_RADIUS * 2 + 20) * numPendulums) / 2, PIVOT_Y, width / 2 + ((BOB_RADIUS * 2 + 20) * numPendulums) / 2, PIVOT_Y);

    // 振り子を描画
    for (let i = 0; i < pendulums.length; i++) {
        let p = pendulums[i];
        let pos = p.body.position;
        let pA = p.constraint.pointA; // 固定点

        // 紐
        stroke('#afafaf');
        strokeWeight(4);
        line(pA.x, pA.y, pos.x, pos.y);

        // 玉
        noStroke();

        // ドラッグ中は色を少し変える
        if (draggingBody === p.body) {
            fill(255, 127, 14); // オレンジっぽいハイライト
        } else {
            fill(p.r, p.g, p.b);
        }

        circle(pos.x, pos.y, p.radius * 2);

        // 質量が違う場合はハイライトを描画して立体感を出す
        fill(255, 255, 255, 60);
        circle(pos.x - p.radius * 0.2, pos.y - p.radius * 0.2, p.radius * 1.2);
    }
}

function windowResized() {
    const container = document.getElementById('canvas-container');
    resizeCanvas(container.offsetWidth, container.offsetHeight);
    createCradle(); // リサイズ時にリセット
}

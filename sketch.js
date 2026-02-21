const { Engine, World, Bodies, Body, Constraint, Mouse, MouseConstraint, Composite } = Matter;

let engine, world;
let pendulums = []; // { body, constraint, defaultColor, massRatio }
let canvas;
let mConstraint; // マウス操作用
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

    // マウスドラッグ制約の設定
    setupMouseInteraction();

    // UIのイベントリスナー設定
    setupUI();

    // 初期化
    createCradle();
}

function setupMouseInteraction() {
    const canvasMouse = Mouse.create(canvas.elt);
    canvasMouse.pixelRatio = pixelDensity();

    // matter.js内蔵のマウス制約を使用。ただし、紐の長さが変わらないようにstiffnessを調整してもうまくいかない場合があるため
    // p5.jsのmousePressedなどで直接Bodyのポジションを操作する方法と併用するか、MouseConstraintに頼るかを決める。
    // ここではMouseConstraintを利用し、表示上はconstraintのanchorsを描画する。
    mConstraint = MouseConstraint.create(engine, {
        mouse: canvasMouse,
        constraint: {
            stiffness: 0.2, // 引っ張るゴムのような強さ。高くしすぎると破綻する
            render: { visible: false }
        }
    });

    // イベントフック: つかんだ瞬間
    Matter.Events.on(mConstraint, 'startdrag', function (event) {
        draggingBody = event.body;
    });

    // 放した瞬間
    Matter.Events.on(mConstraint, 'enddrag', function (event) {
        draggingBody = null;
    });

    World.add(world, mConstraint);
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
    // 既存のオブジェクトを消去（MouseConstraintは残す）
    World.clear(world, true);
    pendulums = [];

    // 固定用の天井みたいなもの（見た目）
    const pivotBaseY = PIVOT_Y;

    // 隙間設定
    const diameter = BOB_RADIUS * 2;
    const gap = hasGap ? 20 : 0;
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
            restitution: 1.0,    // 完全弾性衝突
            friction: 0,         // 摩擦なし
            frictionAir: 0.0001, // 空気抵抗極小
            frictionStatic: 0,
            inertia: Infinity,   // 回転しないようにする
            density: massRatio * 0.001 // 質量調整（densityを使ってmassを制御）
        });

        // 紐（制約）。stiffnessを1にして伸び縮みしないようにする
        const constraint = Constraint.create({
            pointA: { x: x, y: pivotBaseY },
            bodyB: body,
            pointB: { x: 0, y: 0 },
            stiffness: 1.0,
            length: STRING_LENGTH,
            render: { visible: false } // p5で描画するのでmatterのレンダラ用は消す
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

// マウスがcanvas外で離されたときのフェイルセーフ
function mouseReleased() {
    if (mConstraint && mConstraint.body) {
        // Drag終了時の処理を明示的に行う場合
        mConstraint.body = null;
        draggingBody = null;
    }
}

function draw() {
    background(255);
    Engine.update(engine);

    // 天井（梁）を描画
    stroke('#ccc');
    strokeWeight(10);
    line(width / 2 - 200, PIVOT_Y, width / 2 + 200, PIVOT_Y);

    // 振り子を描画
    for (let i = 0; i < pendulums.length; i++) {
        let p = pendulums[i];
        let pos = p.body.position;
        let pA = p.constraint.pointA; // 固定点

        // 紐
        stroke('#777');
        strokeWeight(3);
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
        fill(255, 255, 255, 80);
        circle(pos.x - p.radius * 0.3, pos.y - p.radius * 0.3, p.radius);
    }
}

function windowResized() {
    const container = document.getElementById('canvas-container');
    resizeCanvas(container.offsetWidth, container.offsetHeight);
    createCradle(); // リサイズ時にリセット
}

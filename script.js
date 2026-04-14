// script.js
(function() {
    // ---------- Инициализация Telegram ----------
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
    }

    // ---------- Инициализация Firebase ----------
    const firebaseConfig = {
        apiKey: "AIzaSyCbsWNFwYE-de8BZgBOA0nQylcYiCzr8BY",
        authDomain: "ship-f5928.firebaseapp.com",
        projectId: "ship-f5928",
        storageBucket: "ship-f5928.firebasestorage.app",
        messagingSenderId: "306900434545",
        appId: "1:306900434545:web:14fc945475a5eabd65e5d0",
        measurementId: "G-YY946ZD3XV"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    // ---------- Экраны ----------
    const menuScreen = document.getElementById('menu-screen');
    const gameScreen = document.getElementById('game-screen');
    const settingsPanel = document.getElementById('settings-panel');
    const ratingPanel = document.getElementById('rating-panel');

    document.getElementById('play-bot-btn').addEventListener('click', () => {
        menuScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        resetGame();
    });
    document.getElementById('play-player-btn').addEventListener('click', () => {
        alert('🚧 Режим "Игра с игроком" появится в следующем обновлении!');
    });
    document.getElementById('settings-btn').addEventListener('click', () => {
        settingsPanel.classList.remove('hidden');
        ratingPanel.classList.add('hidden');
    });
    document.getElementById('close-settings-btn').addEventListener('click', () => {
        settingsPanel.classList.add('hidden');
    });
    document.getElementById('rating-btn').addEventListener('click', () => {
        ratingPanel.classList.remove('hidden');
        settingsPanel.classList.add('hidden');
        loadGlobalRating();
    });
    document.getElementById('close-rating-btn').addEventListener('click', () => {
        ratingPanel.classList.add('hidden');
    });
    document.getElementById('back-to-menu-btn').addEventListener('click', () => {
        gameScreen.classList.add('hidden');
        menuScreen.classList.remove('hidden');
        settingsPanel.classList.add('hidden');
        ratingPanel.classList.add('hidden');
    });

    // ---------- Темы ----------
    document.querySelectorAll('.theme-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.body.className = '';
        document.body.classList.add(`theme-${btn.dataset.theme}`);
    }));

    // ---------- Firebase функции для рейтинга ----------
    async function addScoreToFirestore(playerName, score, difficulty) {
        const userId = tg?.initDataUnsafe?.user?.id || 'unknown_user';
        const userName = playerName || tg?.initDataUnsafe?.user?.first_name || 'Игрок';

        try {
            await db.collection("scores").add({
                userId: userId,
                name: userName,
                score: score,
                difficulty: difficulty,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log("Результат сохранён в Firestore");
        } catch (error) {
            console.error("Ошибка сохранения: ", error);
            showFullscreenMessage('⚠️ Ошибка сохранения рекорда', false);
        }
    }

    async function loadGlobalRating() {
        const ratingTableBody = document.getElementById('rating-table-body');
        ratingTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Загрузка...</td></tr>';

        try {
            const scoresSnapshot = await db.collection("scores")
                .orderBy("score", "desc")
                .limit(10)
                .get();

            const topScores = [];
            scoresSnapshot.forEach(doc => topScores.push(doc.data()));

            if (topScores.length === 0) {
                ratingTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">Пока нет рекордов</td></tr>';
                return;
            }

            let html = '<tr><th>#</th><th>Имя</th><th>Очки</th></tr>';
            topScores.forEach((entry, idx) => {
                html += `<tr><td>${idx+1}</td><td>${entry.name || 'Игрок'}</td><td>${entry.score}</td></tr>`;
            });
            ratingTableBody.innerHTML = html;
        } catch (error) {
            console.error("Ошибка загрузки рейтинга: ", error);
            ratingTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Ошибка загрузки</td></tr>';
        }
    }

    // ---------- Игровые переменные ----------
    const BOARD_SIZE = 10;
    const SHIP_SIZES = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
    const CELL = { EMPTY: 'empty', SHIP: 'ship', HIT: 'hit', MISS: 'miss' };

    let currentDifficulty = 'medium';
    let playerBoard, computerBoard, playerShips, computerShips;
    let gameOver = false, playerTurn = true;
    let computerAttackQueue = [];
    let totalSonar = 5, gameSonarUsed = 0, sonarModeActive = false;
    let turnCount = 0;

    const playerBoardEl = document.getElementById('player-board');
    const computerBoardEl = document.getElementById('computer-board');
    const statusMsg = document.getElementById('status-message');
    const playerShipsSpan = document.getElementById('player-ships-count');
    const computerShipsSpan = document.getElementById('computer-ships-count');
    const restartBtn = document.getElementById('restart-button');
    const sonarTotalSpan = document.getElementById('sonar-total');
    const sonarGameSpan = document.getElementById('sonar-game');
    const sonarActivateBtn = document.getElementById('sonar-activate-btn');
    const sonarAdBtn = document.getElementById('sonar-ad-btn');

    function updateSonarUI() {
        sonarTotalSpan.textContent = totalSonar;
        const remaining = Math.max(0, 2 - gameSonarUsed);
        sonarGameSpan.textContent = remaining;
        sonarActivateBtn.disabled = (totalSonar <= 0 || remaining <= 0 || !playerTurn || gameOver || sonarModeActive);
    }

    document.querySelectorAll('.difficulty-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDifficulty = btn.dataset.diff;
        resetGame();
    }));

    function showFullscreenMessage(text, isHit = true) {
        const existing = document.querySelector('.fullscreen-message');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-message';
        const popup = document.createElement('div');
        popup.className = 'message-popup';
        popup.textContent = text;
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        if (tg) tg.HapticFeedback?.impactOccurred(isHit ? 'heavy' : 'light');
        setTimeout(() => {
            popup.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 300);
        }, 1200);
    }

    function markSurroundingCellsAsMiss(board, shipCells) {
        const shipSet = new Set(shipCells.map(c => `${c.r},${c.c}`));
        const toMark = new Set();
        for (let { r, c } of shipCells) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE &&
                        !shipSet.has(`${nr},${nc}`) &&
                        board[nr][nc] !== CELL.HIT &&
                        board[nr][nc] !== CELL.MISS) {
                        toMark.add(`${nr},${nc}`);
                    }
                }
            }
        }
        for (let key of toMark) {
            const [rr, cc] = key.split(',').map(Number);
            board[rr][cc] = CELL.MISS;
        }
    }

    function createEmptyBoard() {
        return Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(CELL.EMPTY));
    }

    function canPlaceShip(board, row, col, size, horiz) {
        if (horiz) {
            if (col + size > BOARD_SIZE) return false;
        } else {
            if (row + size > BOARD_SIZE) return false;
        }
        for (let r = row - 1; r <= row + (horiz ? 1 : size); r++) {
            for (let c = col - 1; c <= col + (horiz ? size : 1); c++) {
                if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === CELL.SHIP) {
                    return false;
                }
            }
        }
        return true;
    }

    function placeShip(board, row, col, size, horiz) {
        const cells = [];
        for (let i = 0; i < size; i++) {
            const r = horiz ? row : row + i;
            const c = horiz ? col + i : col;
            board[r][c] = CELL.SHIP;
            cells.push({ r, c });
        }
        return cells;
    }

    function generateRandomBoard() {
        const board = createEmptyBoard();
        const ships = [];
        for (let size of SHIP_SIZES) {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 500) {
                const hor = Math.random() < 0.5;
                const row = Math.floor(Math.random() * BOARD_SIZE);
                const col = Math.floor(Math.random() * BOARD_SIZE);
                if (canPlaceShip(board, row, col, size, hor)) {
                    const ship = placeShip(board, row, col, size, hor);
                    ships.push({ size, cells: ship, hits: 0 });
                    placed = true;
                }
                attempts++;
            }
            if (!placed) return generateRandomBoard();
        }
        return { board, ships };
    }

    function updateCounters() {
        playerShipsSpan.textContent = playerShips.filter(s => s.hits < s.size).length;
        computerShipsSpan.textContent = computerShips.filter(s => s.hits < s.size).length;
    }

    function renderBoards() {
        renderBoard(playerBoardEl, playerBoard, true);
        renderBoard(computerBoardEl, computerBoard, false);
    }

    function renderBoard(container, board, isPlayer) {
        container.innerHTML = '';
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                const val = board[r][c];
                if (val === CELL.HIT) cell.classList.add('hit');
                else if (val === CELL.MISS) cell.classList.add('miss');
                else if (isPlayer && val === CELL.SHIP) cell.classList.add('ship');
                cell.dataset.row = r;
                cell.dataset.col = c;
                container.appendChild(cell);
            }
        }
    }

    // ИИ
    function getComputerMove() {
        if (currentDifficulty !== 'easy' && computerAttackQueue.length > 0) {
            while (computerAttackQueue.length) {
                const { r, c } = computerAttackQueue.shift();
                if (playerBoard[r][c] !== CELL.HIT && playerBoard[r][c] !== CELL.MISS) {
                    return { r, c };
                }
            }
        }

        if (currentDifficulty === 'easy' || currentDifficulty === 'medium') {
            let attempts = 0;
            while (attempts < 500) {
                const r = Math.floor(Math.random() * BOARD_SIZE);
                const c = Math.floor(Math.random() * BOARD_SIZE);
                if (playerBoard[r][c] !== CELL.HIT && playerBoard[r][c] !== CELL.MISS) {
                    return { r, c };
                }
                attempts++;
            }
            return null;
        }

        const aliveShips = playerShips.filter(s => s.hits < s.size);
        if (!aliveShips.length) return null;

        const weights = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
        for (let ship of aliveShips) {
            const sz = ship.size;
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (c + sz <= BOARD_SIZE) {
                        let ok = true;
                        for (let i = 0; i < sz; i++) {
                            const nr = r, nc = c + i;
                            if (playerBoard[nr][nc] === CELL.MISS) ok = false;
                            if (playerBoard[nr][nc] === CELL.HIT && !ship.cells.some(cell => cell.r === nr && cell.c === nc)) ok = false;
                        }
                        if (ok) {
                            for (let i = 0; i < sz; i++) {
                                if (playerBoard[r][c + i] !== CELL.HIT && playerBoard[r][c + i] !== CELL.MISS) {
                                    weights[r][c + i]++;
                                }
                            }
                        }
                    }
                    if (r + sz <= BOARD_SIZE) {
                        let ok = true;
                        for (let i = 0; i < sz; i++) {
                            const nr = r + i, nc = c;
                            if (playerBoard[nr][nc] === CELL.MISS) ok = false;
                            if (playerBoard[nr][nc] === CELL.HIT && !ship.cells.some(cell => cell.r === nr && cell.c === nc)) ok = false;
                        }
                        if (ok) {
                            for (let i = 0; i < sz; i++) {
                                if (playerBoard[r + i][c] !== CELL.HIT && playerBoard[r + i][c] !== CELL.MISS) {
                                    weights[r + i][c]++;
                                }
                            }
                        }
                    }
                }
            }
        }

        let max = -1;
        let best = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (playerBoard[r][c] !== CELL.HIT && playerBoard[r][c] !== CELL.MISS) {
                    if (weights[r][c] > max) {
                        max = weights[r][c];
                        best = [{ r, c }];
                    } else if (weights[r][c] === max) {
                        best.push({ r, c });
                    }
                }
            }
        }
        return best.length ? best[Math.floor(Math.random() * best.length)] : null;
    }

    function handleShipSunk(ship, board, isPlayerBoard) {
        markSurroundingCellsAsMiss(board, ship.cells);
        if (isPlayerBoard) {
            computerAttackQueue = computerAttackQueue.filter(p =>
                playerBoard[p.r][p.c] !== CELL.MISS && playerBoard[p.r][p.c] !== CELL.HIT
            );
        }
        renderBoards();
    }

    function calculateScore(diff, turns) {
        switch (diff) {
            case 'easy': return Math.max(5, 60 - turns * 2);
            case 'medium': return Math.max(10, 80 - turns * 2);
            case 'hard': return Math.max(15, 120 - turns * 2);
            default: return 10;
        }
    }

    function playerAttack(row, col) {
        if (!playerTurn || gameOver || sonarModeActive) return;
        if (computerBoard[row][col] === CELL.HIT || computerBoard[row][col] === CELL.MISS) {
            statusMsg.textContent = '⚠️ Сюда уже стреляли!';
            return;
        }

        turnCount++;
        const target = computerBoard[row][col];
        let hit = false, sunkShip = null;

        if (target === CELL.SHIP) {
            computerBoard[row][col] = CELL.HIT;
            hit = true;
            const ship = computerShips.find(s => s.cells.some(c => c.r === row && c.c === col));
            if (ship) {
                const prev = ship.hits;
                ship.hits++;
                if (ship.hits === ship.size && prev < ship.size) sunkShip = ship;
            }
            if (sunkShip) {
                showFullscreenMessage('💀 Потоплен!', false);
                statusMsg.textContent = '💥 Корабль уничтожен!';
                handleShipSunk(sunkShip, computerBoard, false);
            } else {
                showFullscreenMessage('💥 Подбит!', true);
                statusMsg.textContent = '🔥 Попадание! Стреляешь снова.';
            }
        } else {
            computerBoard[row][col] = CELL.MISS;
            statusMsg.textContent = '💧 Мимо. Ход переходит врагу.';
            playerTurn = false;
        }

        renderBoards();
        updateCounters();

        if (computerShips.every(s => s.hits === s.size)) {
            gameOver = true;
            const baseScore = calculateScore(currentDifficulty, turnCount);
            const playerName = tg?.initDataUnsafe?.user?.first_name || 'Игрок';
            addScoreToFirestore(playerName, baseScore, currentDifficulty);
            statusMsg.textContent = `🏆 Победа! +${baseScore} очков`;
            showFullscreenMessage('🏆 Победа!', false);
            renderBoards();
            updateSonarUI();
            return;
        }

        if (!hit) {
            updateSonarUI();
            setTimeout(() => computerTurn(), 300);
        } else {
            updateSonarUI();
        }
    }

    function computerTurn() {
        if (gameOver || playerTurn) return;
        const move = getComputerMove();
        if (!move) return;

        const { r, c } = move;
        const target = playerBoard[r][c];
        let hit = false, sunkShip = null;

        if (target === CELL.SHIP) {
            playerBoard[r][c] = CELL.HIT;
            hit = true;
            const ship = playerShips.find(s => s.cells.some(cell => cell.r === r && cell.c === c));
            if (ship) {
                const prev = ship.hits;
                ship.hits++;
                if (ship.hits === ship.size && prev < ship.size) sunkShip = ship;
            }
            if (currentDifficulty !== 'easy') {
                [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE &&
                        playerBoard[nr][nc] !== CELL.HIT && playerBoard[nr][nc] !== CELL.MISS) {
                        computerAttackQueue.push({ r: nr, c: nc });
                    }
                });
            }
            if (sunkShip) {
                showFullscreenMessage('💀 Потоплен!', false);
                statusMsg.textContent = '💔 Враг потопил твой корабль';
                handleShipSunk(sunkShip, playerBoard, true);
            } else {
                showFullscreenMessage('💥 Подбит!', true);
                statusMsg.textContent = '💥 Враг попал в твой корабль!';
            }
        } else {
            playerBoard[r][c] = CELL.MISS;
            statusMsg.textContent = '🌊 Враг промахнулся. Твой ход!';
            playerTurn = true;
        }

        renderBoards();
        updateCounters();

        if (playerShips.every(s => s.hits === s.size)) {
            gameOver = true;
            statusMsg.textContent = '💀 Поражение';
            showFullscreenMessage('💀 Поражение', false);
            renderBoards();
            updateSonarUI();
            return;
        }

        if (hit && !gameOver) {
            setTimeout(() => computerTurn(), 300);
        } else {
            playerTurn = true;
            statusMsg.textContent = '🎯 Твой ход';
            updateSonarUI();
        }
    }

    function activateSonarMode() {
        if (totalSonar <= 0 || gameSonarUsed >= 2 || !playerTurn || gameOver) return;
        sonarModeActive = true;
        statusMsg.textContent = '🔍 Выбери центральную клетку области 3×3';
        updateSonarUI();
    }

    function handleSonarScan(centerRow, centerCol) {
        let shipFound = false;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const r = centerRow + dr, c = centerCol + dc;
                if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && computerBoard[r][c] === CELL.SHIP) {
                    shipFound = true;
                }
            }
        }
        totalSonar--;
        gameSonarUsed++;
        showFullscreenMessage(shipFound ? '🚢 Обнаружен корабль!' : '🌊 Пусто', false);
        statusMsg.textContent = shipFound ? '🔍 Сонар: есть корабль!' : '🔍 Сонар: пусто';
        sonarModeActive = false;
        updateSonarUI();
    }

    computerBoardEl.addEventListener('click', e => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const row = +cell.dataset.row;
        const col = +cell.dataset.col;
        if (sonarModeActive) {
            handleSonarScan(row, col);
        } else {
            if (!playerTurn || gameOver) return;
            playerAttack(row, col);
        }
    });

    sonarActivateBtn.addEventListener('click', activateSonarMode);
    sonarAdBtn.addEventListener('click', () => {
        totalSonar += 1;
        updateSonarUI();
        showFullscreenMessage('📺 +1 скан!', false);
    });

    function resetGame() {
        const p = generateRandomBoard();
        const c = generateRandomBoard();
        playerBoard = p.board;
        playerShips = p.ships;
        computerBoard = c.board;
        computerShips = c.ships;
        gameOver = false;
        playerTurn = true;
        computerAttackQueue = [];
        gameSonarUsed = 0;
        sonarModeActive = false;
        turnCount = 0;
        renderBoards();
        updateCounters();
        statusMsg.textContent = '🎯 Твой ход';
        updateSonarUI();
    }

    restartBtn.addEventListener('click', resetGame);
    updateSonarUI();
})();
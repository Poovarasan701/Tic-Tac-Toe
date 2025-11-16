/* Tic-Tac-Toe with AI (minimax), sounds, confetti, responsive UI and WebRTC P2P (manual signaling).
   Save as script.js and open index.html in the browser.
*/

///// Utility & State
const BOARD_SIZE = 9;
let board = Array(9).fill("");
let current = "X";
let active = true;
let mode = "single";            // "single" | "local" | "online"
let difficulty = "easy";        // "easy" | "hard"
let playerMark = "X";           // player mark when single player
const winsKey = "ttt_wins", lossesKey = "ttt_losses", drawsKey = "ttt_draws";
const winsEl = id("wins"), lossesEl = id("losses"), drawsEl = id("draws");
const statusEl = id("status"), boardEl = id("board");
const confettiCanvas = id("confettiCanvas");

const winCombos = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

// WebRTC variables
let pc = null, dc = null;
const signalingBox = id("signalingBox");
const createOfferBtn = id("createOffer"), createAnswerBtn = id("createAnswer"), connectClear = id("connectClear");

// Audio: simple WebAudio synth for effects
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function beep(freq=440,dur=0.08,vol=0.12){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine"; o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}

/* DOM helpers */
function id(i){return document.getElementById(i)}
function el(tag, cls){ const e = document.createElement(tag); if(cls) e.className = cls; return e }

///// INIT UI
function init(){
  // build board cells
  boardEl.innerHTML = "";
  for(let i=0;i<9;i++){
    const c = el("div","cell");
    c.dataset.index = i;
    c.addEventListener("click", ()=> onCellClick(i));
    boardEl.appendChild(c);
  }

  // load settings
  const modeSelect = id("modeSelect"), difficultySel = id("difficulty"), playerMarkSel = id("playerMark");
  modeSelect.value = mode;
  difficultySel.value = difficulty;
  playerMarkSel.value = playerMark;

  modeSelect.onchange = () => {
    mode = modeSelect.value;
    id("aiSettings").style.display = mode === "single" ? "flex" : "none";
    id("onlineControls").style.display = mode === "online" ? "flex" : "none";
    resetGame();
    if(mode === "online") initP2PUI();
  };
  difficultySel.onchange = () => difficulty = difficultySel.value;
  playerMarkSel.onchange = () => playerMark = playerMarkSel.value;

  // controls
  id("resetBtn").addEventListener("click", ()=> { resetGame(); beep(330,0.06) });
  id("clearStats").addEventListener("click", ()=> { localStorage.removeItem(winsKey); localStorage.removeItem(lossesKey); localStorage.removeItem(drawsKey); loadStats() });

  // theme toggle
  const themeToggle = id("themeToggle");
  themeToggle.addEventListener("click", toggleTheme);
  loadTheme();

  // WebRTC buttons
  createOfferBtn.addEventListener("click", createOffer);
  createAnswerBtn.addEventListener("click", createAnswerFromOffer);
  connectClear.addEventListener("click", ()=> signalingBox.value = "");

  // load leaderboard
  loadStats();

  // initial render
  render();
}
window.addEventListener("load", init);

///// GAME FLOW
function onCellClick(index){
  if(!active) return;
  if(board[index] !== "") return;

  // local/online mode checks
  if(mode === "online"){
    // If we are online and it's the remote player's turn, block local clicks
    // convention: current is X/O. Determine which mark local user controls:
    const localMark = playerMark; // when online, playerMark determines local side (we'll let user choose)
    // But to simplify: in online mode, dataChannel messages will sync board; here we allow local move only if current === localMark
    if(current !== localMark) return;
  }

  makeMove(index, current);
  beep(880,0.04,0.06);

  if(checkEnd()) return;

  if(mode === "single"){
    // AI move if needed
    if(current !== playerMark && active){
      setTimeout(()=> {
        aiMove();
      }, 240);
    }
  } else if(mode === "online"){
    // send move to remote via data channel if exists
    sendRemote({type:"move", index});
  }
}

function makeMove(index, mark){
  board[index] = mark;
  render();
  // swap turn
  current = (mark === "X") ? "O" : "X";
  statusEl.textContent = `Player ${current}'s turn`;
}

function aiMove(){
  if(!active) return;
  let moveIndex = -1;
  if(difficulty === "easy"){
    const empty = board.map((v,i)=> v===""?i:null).filter(v=>v!==null);
    moveIndex = empty[Math.floor(Math.random()*empty.length)];
  } else {
    // minimax for 'hard' - AI plays as the opposite of playerMark
    const aiMark = (playerMark === "X") ? "O" : "X";
    moveIndex = bestMove(board, aiMark);
  }
  if(moveIndex!=null && moveIndex>=0) {
    makeMove(moveIndex, current);
    beep(600,0.04,0.06);
    checkEnd();
  }
}

function checkEnd(){
  // check winner
  for(const combo of winCombos){
    const [a,b,c] = combo;
    if(board[a] && board[a] === board[b] && board[a] === board[c]){
      active = false;
      const winner = board[a];
      statusEl.textContent = `Player ${winner} Wins!`;
      highlightWin(combo);
      playConfetti();
      beep(220,0.18,0.14);
      // leaderboard update: if single player and playerMark === winner => increment wins, else losses
      if(mode === "single"){
        if(winner === playerMark) incrementStat(winsKey);
        else incrementStat(lossesKey);
      } else if(mode === "local"){
        // treat X as wins, O as losses from perspective of first player? We'll increment wins for X, losses for O to keep it simple
        if(winner === "X") incrementStat(winsKey);
        else incrementStat(lossesKey);
      } else if(mode === "online"){
        // increment local stats based on local player's mark
        const localMark = playerMark;
        if(winner === localMark) incrementStat(winsKey);
        else incrementStat(lossesKey);
      }
      loadStats();
      return true;
    }
  }
  if(!board.includes("")){
    active = false;
    statusEl.textContent = "It's a Draw!";
    playConfetti(true);
    beep(440,0.14,0.08);
    incrementStat(drawsKey);
    loadStats();
    return true;
  }
  return false;
}

function highlightWin(combo){
  // add 'win' class to winning cells briefly
  combo.forEach(i=>{
    const cell = boardEl.children[i];
    cell.classList.add("win");
  });
  setTimeout(()=> combo.forEach(i=> boardEl.children[i].classList.remove("win")), 1200);
}

function render(){
  // update board UI
  for(let i=0;i<9;i++){
    const cell = boardEl.children[i];
    cell.textContent = board[i] || "";
  }
  // status handled elsewhere
}

function resetGame(){
  board = Array(9).fill("");
  current = "X";
  active = true;
  statusEl.textContent = `Player ${current}'s Turn`;
  render();
  clearConfetti();
}

// leaderboard functions
function loadStats(){
  winsEl.textContent = localStorage.getItem(winsKey) || 0;
  lossesEl.textContent = localStorage.getItem(lossesKey) || 0;
  drawsEl.textContent = localStorage.getItem(drawsKey) || 0;
}
function incrementStat(key){
  const v = parseInt(localStorage.getItem(key) || "0",10) + 1;
  localStorage.setItem(key, v);
}

/* ---------------------------
   MINIMAX (Hard AI)
   --------------------------- */
function bestMove(boardState, aiMark){
  // returns best move index for aiMark
  const human = aiMark === "X" ? "O" : "X";

  function evaluate(b){
    for(const c of winCombos){
      if(b[c[0]] && b[c[0]] === b[c[1]] && b[c[1]] === b[c[2]]){
        return b[c[0]] === aiMark ? 10 : -10;
      }
    }
    if(!b.includes("")) return 0; // draw
    return null;
  }

  function minimax(b, depth, isMax){
    const score = evaluate(b);
    if(score !== null) return score;
    if(!b.includes("")) return 0;

    if(isMax){
      let best = -Infinity;
      for(let i=0;i<9;i++){
        if(b[i]===""){
          b[i] = aiMark;
          const val = minimax(b, depth+1, false);
          b[i] = "";
          best = Math.max(best, val);
        }
      }
      return best;
    } else {
      let best = Infinity;
      for(let i=0;i<9;i++){
        if(b[i]===""){
          b[i] = human;
          const val = minimax(b, depth+1, true);
          b[i] = "";
          best = Math.min(best, val);
        }
      }
      return best;
    }
  }

  let bestVal = -Infinity, move = -1;
  for(let i=0;i<9;i++){
    if(boardState[i]===""){
      boardState[i] = aiMark;
      const val = minimax(boardState, 0, false);
      boardState[i] = "";
      if(val > bestVal){ bestVal = val; move = i; }
    }
  }
  // fallback
  if(move === -1){
    const empties = boardState.map((v,i)=>v===""?i:null).filter(v=>v!==null);
    return empties[Math.floor(Math.random()*empties.length)];
  }
  return move;
}

/* ---------------------------
   Confetti (simple)
   --------------------------- */
let confettiCtx = confettiCanvas.getContext ? confettiCanvas.getContext("2d") : null;
let confettiPieces = [], confettiRAF = null;
function resizeConfetti(){
  confettiCanvas.width = innerWidth;
  confettiCanvas.height = innerHeight;
}
window.addEventListener("resize", resizeConfetti);
resizeConfetti();

function createConfettiPiece(){
  return {
    x: Math.random()*confettiCanvas.width,
    y: -10 - Math.random()*100,
    r: 6 + Math.random()*8,
    vx: -2 + Math.random()*4,
    vy: 2 + Math.random()*4,
    color: `hsl(${Math.floor(Math.random()*360)},80%,60%)`,
    rot: Math.random()*360,
    vrot: -6 + Math.random()*12
  };
}
function playConfetti(isDraw=false){
  // more pieces on win
  const count = isDraw ? 36 : 80;
  for(let i=0;i<count;i++) confettiPieces.push(createConfettiPiece());
  if(!confettiRAF) runConfetti();
  setTimeout(()=> { /* auto-stop after 2.5s */ clearConfetti(); }, 2500);
}
function runConfetti(){
  confettiRAF = requestAnimationFrame(runConfetti);
  confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);
  confettiPieces.forEach((p,idx) => {
    p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
    confettiCtx.save();
    confettiCtx.translate(p.x,p.y);
    confettiCtx.rotate(p.rot * Math.PI/180);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.r/2, -p.r/2, p.r, p.r);
    confettiCtx.restore();
    if(p.y > confettiCanvas.height + 50) confettiPieces.splice(idx,1);
  });
  if(confettiPieces.length===0){
    cancelAnimationFrame(confettiRAF);
    confettiRAF = null;
  }
}
function clearConfetti(){ confettiPieces=[]; if(confettiRAF){ cancelAnimationFrame(confettiRAF); confettiRAF=null } confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height); }

///// THEME
function toggleTheme(){
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  localStorage.setItem("ttt_theme", isDark ? "dark":"light");
  id("themeToggle").textContent = isDark ? "☀" : "🌙";
}
function loadTheme(){
  const t = localStorage.getItem("ttt_theme");
  if(t === "dark"){
    document.documentElement.classList.add("dark");
    id("themeToggle").textContent = "☀";
  }
}
// small dark theme CSS injection for convenience
const darkCSS = `
:root{--bg:#071028;--panel:#0f1724;--muted:#9aa7c0;--accent:#8b5cf6;color:#e6eef9}
body{background:var(--bg);color:var(--accent)}
.panel{background:var(--panel);box-shadow:none}
.cell{background:#071428;color:#e6eef9}
`;
(function applyDarkStyle(){
  const s = document.createElement("style"); s.id="darkStyle"; s.textContent = darkCSS;
  document.head.appendChild(s);
})();

///// WebRTC P2P (manual signaling)
function initP2PUI(){
  // create RTCPeerConnection and DataChannel as needed when user presses createOffer / createAnswer
  // Nothing auto-created to keep manual flow explicit
}

async function createOffer(){
  pc = new RTCPeerConnection();
  dc = pc.createDataChannel("ttt");
  setupDataChannel(dc);
  pc.onicecandidate = (e) => {
    if(e.candidate) return;
    // ICE gathering finished — send sdp
    signalingBox.value = JSON.stringify(pc.localDescription);
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  // Wait for ICE to finish - handled by onicecandidate
  alert("Offer created — copy the JSON from the box and send it to your remote player. They should paste it and click 'Create Answer'.");
}

async function createAnswerFromOffer(){
  try {
    const offer = JSON.parse(signalingBox.value);
    pc = new RTCPeerConnection();
    pc.ondatachannel = (ev)=> {
      dc = ev.channel;
      setupDataChannel(dc);
    };
    pc.onicecandidate = (e)=>{
      if(e.candidate) return;
      signalingBox.value = JSON.stringify(pc.localDescription);
    };
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    alert("Answer created — copy the JSON and send it back to the offerer. Once they paste it into their box and setRemoteDescription, connection will open.");
    // when answer is created, localDescription will be shown automatically via onicecandidate handler
  } catch(err){
    alert("Invalid offer JSON. Paste the offer JSON into the box first.");
    console.error(err);
  }
}

function setupDataChannel(channel){
  channel.onopen = ()=> {
    console.log("DataChannel open");
    alert("P2P connected! You can now play. Moves will sync.");
  };
  channel.onmessage = (ev)=> {
    try {
      const msg = JSON.parse(ev.data);
      if(msg.type === "move"){ // remote made a move
        // apply remote move if local board matches
        if(board[msg.index] === ""){
          makeMove(msg.index, current); // remote side makes mark = current (they were current)
          checkEnd();
        }
      } else if(msg.type === "reset"){
        resetGame();
      }
    } catch(e){ console.warn("bad remote msg", e) }
  };
  channel.onerror = (e)=> console.error("dc err",e);
}

function sendRemote(obj){
  if(dc && dc.readyState === "open"){
    dc.send(JSON.stringify(obj));
  }
}

/* When a user accepts an answer (offerer side) they must paste the answer JSON into their box and then we setRemoteDescription
   We'll support a simple flow: if pc exists and localSide created offer, the user pastes the remote answer into the box — we will setRemoteDescription.
*/
signalingBox.addEventListener("input", async ()=>{
  // attempt to parse incoming JSON as answer if pc exists and is in 'have-local-offer'
  try {
    const obj = JSON.parse(signalingBox.value);
    if(pc && pc.signalingState === "have-local-offer" && obj.type === "answer"){
      await pc.setRemoteDescription(obj);
      console.log("Remote answer set — connection should establish once ICE done.");
    }
    // if pc exists and remote description not set, other flows may be possible
  } catch(e){}
});

/* ---------------------------
   Helpers & small polish
   --------------------------- */
function sendResetRemote(){
  sendRemote({type:"reset"});
}
window.addEventListener("beforeunload", ()=> {
  if(dc && dc.readyState === "open") dc.close();
  if(pc) pc.close();
});

/* small initial reset and UI tweaks */
resetGame();
loadStats();

/* END OF SCRIPT */

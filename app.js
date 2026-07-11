/* ==========================================================================
   Turf Cricket Scorer - Core Logic (app.js)
   ========================================================================== */

// --- State Management ---
let tournament = {
  dayName: '',
  defaultTeamA: 'Team Alpha',
  defaultTeamB: 'Team Bravo',
  oversPerMatch: 6,
  wicketsPerInnings: 10,
  maxOversPerBowler: 2,
  batsmanRetireRuns: null,
  wideValue: 1,
  noballValue: 1,
  wideRebowl: true,
  noballRebowl: true,
  byesAllowed: true,
  matches: []
};

let activeMatch = null;

// --- DOM Elements ---
const themeToggle = document.getElementById('theme-toggle');
const screens = {
  'setup': document.getElementById('screen-setup'),
  'dashboard': document.getElementById('screen-dashboard'),
  'match-setup': document.getElementById('screen-match-setup'),
  'scoring': document.getElementById('screen-scoring'),
  'summary': document.getElementById('screen-match-summary')
};

// Forms
const formSetup = document.getElementById('form-setup');
const formMatchSetup = document.getElementById('form-match-setup');

// Dialogs
const dialogSelectBatters = document.getElementById('dialog-select-batters');
const dialogSelectBowler = document.getElementById('dialog-select-bowler');
const dialogWicketPicker = document.getElementById('dialog-wicket-picker');
const dialogRetireBatter = document.getElementById('dialog-retire-batter');

// Live announcer
const a11yAnnouncer = document.getElementById('a11y-announcer');

// --- Helper Functions ---

// Screen Router
function showScreen(screenId) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenId].classList.add('active');
  window.scrollTo(0, 0);
}

// A11y Speech Announcer
function announce(message) {
  a11yAnnouncer.textContent = message;
  // Clear after a delay so repeat announcements are read
  setTimeout(() => {
    a11yAnnouncer.textContent = '';
  }, 2000);
}

// Theme management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
}

themeToggle.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  announce(`Switched to ${isLight ? 'light' : 'dark'} mode`);
});

// Deep Copy for History/Undo State
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Format Over Representation (e.g. 5 balls -> 0.5, 6 balls -> 1.0, 8 balls -> 1.2)
function ballsToOvers(ballsCount) {
  const completedOvers = Math.floor(ballsCount / 6);
  const remainingBalls = ballsCount % 6;
  return `${completedOvers}.${remainingBalls}`;
}

// Save & Load LocalStorage
function saveState() {
  localStorage.setItem('turf_cricket_tournament', JSON.stringify(tournament));
  if (activeMatch) {
    localStorage.setItem('turf_cricket_active_match', JSON.stringify(activeMatch));
  } else {
    localStorage.removeItem('turf_cricket_active_match');
  }
}

function loadState() {
  const savedTourney = localStorage.getItem('turf_cricket_tournament');
  const savedActiveMatch = localStorage.getItem('turf_cricket_active_match');
  
  if (savedTourney) {
    tournament = JSON.parse(savedTourney);
    updateDashboardUI();
    showScreen('dashboard');
  } else {
    showScreen('setup');
  }
  
  if (savedActiveMatch) {
    activeMatch = JSON.parse(savedActiveMatch);
    updateScoringUI();
    showScreen('scoring');
    
    // Check if we need opening batter details
    const innings = activeMatch.innings[activeMatch.currentInnings - 1];
    if (!innings.striker || !innings.nonStriker || !innings.currentBowler) {
      promptOpeners();
    }
  }
}

// --- Setup Screen Events ---
formSetup.addEventListener('submit', (e) => {
  e.preventDefault();
  
  tournament.dayName = document.getElementById('day-name').value;
  tournament.defaultTeamA = document.getElementById('default-team-a').value || 'Team Alpha';
  tournament.defaultTeamB = document.getElementById('default-team-b').value || 'Team Bravo';
  
  tournament.oversPerMatch = parseInt(document.getElementById('overs-per-match').value, 10);
  tournament.wicketsPerInnings = parseInt(document.getElementById('wickets-per-innings').value, 10);
  tournament.maxOversPerBowler = parseInt(document.getElementById('max-overs-per-bowler').value, 10);
  
  const retireVal = document.getElementById('batsman-retire-runs').value;
  tournament.batsmanRetireRuns = retireVal ? parseInt(retireVal, 10) : null;
  
  tournament.wideValue = parseInt(document.getElementById('wide-value').value, 10);
  tournament.noballValue = parseInt(document.getElementById('noball-value').value, 10);
  
  tournament.wideRebowl = document.getElementById('wide-rebowl').checked;
  tournament.noballRebowl = document.getElementById('noball-rebowl').checked;
  tournament.byesAllowed = document.getElementById('byes-allowed').checked;
  
  tournament.matches = [];
  
  saveState();
  updateDashboardUI();
  showScreen('dashboard');
  announce("Scoring session started successfully.");
});

// --- Dashboard Screen Events ---
document.getElementById('btn-start-match').addEventListener('click', () => {
  document.getElementById('match-team-a').value = tournament.defaultTeamA;
  document.getElementById('match-team-b').value = tournament.defaultTeamB;
  showScreen('match-setup');
});

document.getElementById('btn-cancel-match-setup').addEventListener('click', () => {
  showScreen('dashboard');
});

formMatchSetup.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const teamA = document.getElementById('match-team-a').value;
  const teamB = document.getElementById('match-team-b').value;
  const tossWinner = document.getElementById('toss-winner').value; // 'batting' (A) or 'bowling' (B)
  const tossDecision = document.getElementById('toss-decision').value; // 'bat' or 'bowl'
  
  let battingFirst = '';
  let bowlingFirst = '';
  
  if (tossWinner === 'batting') {
    battingFirst = tossDecision === 'bat' ? teamA : teamB;
    bowlingFirst = tossDecision === 'bat' ? teamB : teamA;
  } else {
    battingFirst = tossDecision === 'bat' ? teamB : teamA;
    bowlingFirst = tossDecision === 'bat' ? teamA : teamB;
  }
  
  // Initialize Active Match State
  activeMatch = {
    id: 'match_' + Date.now(),
    teamA: teamA,
    teamB: teamB,
    tossWinner: tossWinner === 'batting' ? teamA : teamB,
    tossDecision: tossDecision,
    battingFirst: battingFirst,
    bowlingFirst: bowlingFirst,
    currentInnings: 1,
    status: 'live',
    victoryMessage: '',
    history: [], // For Undo Stack
    innings: [
      createInningsObject(battingFirst, bowlingFirst),
      createInningsObject(bowlingFirst, battingFirst)
    ]
  };
  
  saveState();
  showScreen('scoring');
  updateScoringUI();
  promptOpeners();
  announce(`Match started. ${battingFirst} batting first.`);
});

function createInningsObject(battingTeam, bowlingTeam) {
  return {
    battingTeam: battingTeam,
    bowlingTeam: bowlingTeam,
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: { wide: 0, noball: 0, bye: 0, legbye: 0, total: 0 },
    batters: {}, // Name -> { runs, balls, fours, sixes, status, outInfo }
    bowlers: {}, // Name -> { balls, runs, wickets, maidens, currentOverRuns, currentOverWides, currentOverNoBalls }
    striker: '',
    nonStriker: '',
    currentBowler: '',
    overTimeline: [], // Timeline events for current over
    fallOfWickets: [],
    oversList: [] // Complete list of past overs
  };
}

// Prompt Opening Batter details
function promptOpeners() {
  dialogSelectBatters.showModal();
}

dialogSelectBatters.addEventListener('submit', (e) => {
  const striker = document.getElementById('input-opener-striker').value.trim();
  const nonStriker = document.getElementById('input-opener-nonstriker').value.trim();
  const bowler = document.getElementById('input-opener-bowler').value.trim();
  
  if (!striker || !nonStriker || !bowler) return;
  
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  
  innings.striker = striker;
  innings.nonStriker = nonStriker;
  innings.currentBowler = bowler;
  
  // Register in player lists
  innings.batters[striker] = { runs: 0, balls: 0, fours: 0, sixes: 0, status: 'batting' };
  innings.batters[nonStriker] = { runs: 0, balls: 0, fours: 0, sixes: 0, status: 'batting' };
  innings.bowlers[bowler] = { balls: 0, runs: 0, wickets: 0, maidens: 0, currentOverRuns: 0 };
  
  saveState();
  updateScoringUI();
  announce(`Striker: ${striker}, Non-Striker: ${nonStriker}, Bowler: ${bowler}. Let's play!`);
});

// --- Scoring Logic ---

// Record State snapshot for Undo history
function saveHistory() {
  const snapshot = {
    currentInnings: activeMatch.currentInnings,
    status: activeMatch.status,
    victoryMessage: activeMatch.victoryMessage,
    innings: deepCopy(activeMatch.innings)
  };
  activeMatch.history.push(snapshot);
}

// Handle Legal Runs (0, 1, 2, 3, 4, 6)
function recordRuns(runsVal) {
  if (!activeMatch || activeMatch.status !== 'live') return;
  saveHistory();
  
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  const striker = innings.batters[innings.striker];
  const bowler = innings.bowlers[innings.currentBowler];
  
  // Update score
  innings.runs += runsVal;
  innings.balls += 1;
  
  // Update batter
  striker.runs += runsVal;
  striker.balls += 1;
  if (runsVal === 4) striker.fours += 1;
  if (runsVal === 6) striker.sixes += 1;
  
  // Update bowler
  bowler.runs += runsVal;
  bowler.balls += 1;
  bowler.currentOverRuns += runsVal;
  
  // Update timeline
  innings.overTimeline.push(runsVal.toString());
  
  // Check if striker reached retire threshold
  let retiredMsg = '';
  if (tournament.batsmanRetireRuns && striker.runs >= tournament.batsmanRetireRuns) {
    retiredMsg = `${innings.striker} has reached ${striker.runs} runs and must retire. `;
    striker.status = 'retired';
    innings.striker = '';
  }
  
  // Rotate strike on odd runs
  if (runsVal % 2 === 1 && innings.striker) {
    swapStrike(innings);
  }
  
  announce(`${runsVal} run${runsVal !== 1 ? 's' : ''} scored. ${retiredMsg}`);
  
  afterBallCheck(retiredMsg !== '');
}

// Handle Extras (Wide, No Ball, Bye, Leg Bye)
function recordExtra(type) {
  if (!activeMatch || activeMatch.status !== 'live') return;
  
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  const striker = innings.batters[innings.striker];
  const bowler = innings.bowlers[innings.currentBowler];
  
  if (type === 'wide') {
    saveHistory();
    const penalty = tournament.wideValue;
    innings.runs += penalty;
    innings.extras.wide += penalty;
    innings.extras.total += penalty;
    
    bowler.runs += penalty;
    bowler.currentOverRuns += penalty;
    
    innings.overTimeline.push('Wd');
    
    if (tournament.wideRebowl) {
      // Wide doesn't count as a legal ball
    } else {
      innings.balls += 1;
      bowler.balls += 1;
      striker.balls += 1; // counts for batsman statistics in non-rebowl turf rules
    }
    
    announce(`Wide ball, +${penalty} runs.`);
    afterBallCheck();
    
  } else if (type === 'noball') {
    saveHistory();
    const penalty = tournament.noballValue;
    innings.runs += penalty;
    innings.extras.noball += penalty;
    innings.extras.total += penalty;
    
    bowler.runs += penalty;
    bowler.currentOverRuns += penalty;
    
    innings.overTimeline.push('Nb');
    
    if (tournament.noballRebowl) {
      // No ball doesn't count as legal over ball
    } else {
      innings.balls += 1;
      bowler.balls += 1;
      striker.balls += 1;
    }
    
    announce(`No ball, +${penalty} runs.`);
    afterBallCheck();
    
  } else if (type === 'bye' || type === 'legbye') {
    if (!tournament.byesAllowed) {
      announce("Byes/Leg-byes are disabled by custom tournament rules.");
      return;
    }
    
    // Prompt how many runs were run
    const runString = prompt("Enter number of Byes/Leg Byes run:", "1");
    const runsRun = parseInt(runString, 10);
    if (isNaN(runsRun) || runsRun < 0) return;
    
    saveHistory();
    innings.runs += runsRun;
    innings.balls += 1;
    
    if (type === 'bye') {
      innings.extras.bye += runsRun;
    } else {
      innings.extras.legbye += runsRun;
    }
    innings.extras.total += runsRun;
    
    striker.balls += 1; // batsman faced a ball, but gets no runs
    bowler.balls += 1;
    // Byes/legbyes do NOT count against the bowler's runs conceded profile
    
    innings.overTimeline.push(`${type === 'bye' ? 'B' : 'Lb'}${runsRun}`);
    
    // Rotate strike on odd runs
    if (runsRun % 2 === 1) {
      swapStrike(innings);
    }
    
    announce(`${runsRun} ${type}${runsRun !== 1 ? 's' : ''} recorded.`);
    afterBallCheck();
  }
}

// Swap Strike Manual Trigger
document.getElementById('btn-rotate-strike').addEventListener('click', () => {
  if (!activeMatch || activeMatch.status !== 'live') return;
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  if (!innings.striker || !innings.nonStriker) {
    announce("Cannot swap strike without both batters set.");
    return;
  }
  saveHistory();
  swapStrike(innings);
  updateScoringUI();
  saveState();
  announce("Strike swapped.");
});

function swapStrike(innings) {
  const temp = innings.striker;
  innings.striker = innings.nonStriker;
  innings.nonStriker = temp;
}

// Retire batter manual trigger
document.getElementById('btn-retire-batter').addEventListener('click', () => {
  if (!activeMatch || activeMatch.status !== 'live') return;
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  
  const select = document.getElementById('retire-batter-select');
  select.innerHTML = '';
  
  if (innings.striker) {
    const opt1 = document.createElement('option');
    opt1.value = 'striker';
    opt1.textContent = `${innings.striker} (Striker)`;
    select.appendChild(opt1);
  }
  if (innings.nonStriker) {
    const opt2 = document.createElement('option');
    opt2.value = 'nonstriker';
    opt2.textContent = `${innings.nonStriker} (Non-Striker)`;
    select.appendChild(opt2);
  }
  
  document.getElementById('input-retire-next-batter').value = '';
  dialogRetireBatter.showModal();
});

document.getElementById('btn-cancel-retire').addEventListener('click', () => {
  dialogRetireBatter.close();
});

dialogRetireBatter.addEventListener('submit', (e) => {
  const which = document.getElementById('retire-batter-select').value;
  const nextBatter = document.getElementById('input-retire-next-batter').value.trim();
  
  if (!nextBatter) return;
  saveHistory();
  
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  const oldBatterName = which === 'striker' ? innings.striker : innings.nonStriker;
  
  innings.batters[oldBatterName].status = 'retired';
  
  if (which === 'striker') {
    innings.striker = nextBatter;
  } else {
    innings.nonStriker = nextBatter;
  }
  
  innings.batters[nextBatter] = { runs: 0, balls: 0, fours: 0, sixes: 0, status: 'batting' };
  
  dialogRetireBatter.close();
  saveState();
  updateScoringUI();
  announce(`${oldBatterName} retired hurt. ${nextBatter} is in.`);
});

// Wicket trigger click
document.getElementById('btn-wicket-trigger').addEventListener('click', () => {
  if (!activeMatch || activeMatch.status !== 'live') return;
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  
  const selectBatter = document.getElementById('wicket-batter-out');
  selectBatter.innerHTML = '';
  
  if (innings.striker) {
    const opt1 = document.createElement('option');
    opt1.value = 'striker';
    opt1.textContent = innings.striker;
    selectBatter.appendChild(opt1);
  }
  if (innings.nonStriker) {
    const opt2 = document.createElement('option');
    opt2.value = 'nonstriker';
    opt2.textContent = innings.nonStriker;
    selectBatter.appendChild(opt2);
  }
  
  // Reset fields
  document.getElementById('input-fielder-name').value = '';
  document.getElementById('input-next-batter').value = '';
  document.getElementById('input-next-batter').required = true;
  document.getElementById('group-next-batter').classList.remove('hidden');
  
  // Show fielder box for runout
  toggleWicketTypeFields();
  
  dialogWicketPicker.showModal();
});

document.getElementById('wicket-type').addEventListener('change', toggleWicketTypeFields);

function toggleWicketTypeFields() {
  const type = document.getElementById('wicket-type').value;
  const fielderGroup = document.querySelector('.id-runout-fielder');
  
  if (type === 'Run Out' || type === 'Caught' || type === 'Stumped') {
    fielderGroup.classList.remove('hidden');
  } else {
    fielderGroup.classList.add('hidden');
  }
  
  // If retired hurt, next batter is not required if innings is over, but let's keep standard
  if (type === 'Retired Hurt') {
    document.getElementById('group-next-batter').classList.add('hidden');
    document.getElementById('input-next-batter').required = false;
  } else {
    document.getElementById('group-next-batter').classList.remove('hidden');
    document.getElementById('input-next-batter').required = true;
  }
}

document.getElementById('btn-cancel-wicket').addEventListener('click', () => {
  dialogWicketPicker.close();
});

dialogWicketPicker.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const type = document.getElementById('wicket-type').value;
  const whichBatter = document.getElementById('wicket-batter-out').value; // 'striker' or 'nonstriker'
  const fielderName = document.getElementById('input-fielder-name').value.trim();
  const nextBatterName = document.getElementById('input-next-batter').value.trim();
  
  saveHistory();
  
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  const dismissedBatterName = whichBatter === 'striker' ? innings.striker : innings.nonStriker;
  
  // Update scorecard totals
  innings.wickets += 1;
  
  // Wicket counts against batsman ball count
  if (type !== 'Retired Hurt') {
    innings.balls += 1;
    innings.batters[dismissedBatterName].balls += 1;
    
    const bowler = innings.bowlers[innings.currentBowler];
    bowler.balls += 1;
    if (type !== 'Run Out') {
      bowler.wickets += 1; // Run out doesn't go to bowler's credit
    }
  }
  
  // Mark dismissed batter status
  let outDesc = type;
  if (fielderName) outDesc += ` (Fielder: ${fielderName})`;
  innings.batters[dismissedBatterName].status = 'out';
  innings.batters[dismissedBatterName].outInfo = outDesc;
  
  // Fall of wicket entry
  innings.fallOfWickets.push({
    wickets: innings.wickets,
    runs: innings.runs,
    overs: ballsToOvers(innings.balls)
  });
  
  innings.overTimeline.push('W');
  
  // Assign new batter or close innings
  const isAllOut = innings.wickets >= tournament.wicketsPerInnings;
  
  if (isAllOut) {
    if (whichBatter === 'striker') innings.striker = '';
    else innings.nonStriker = '';
    announce(`Wicket! ${dismissedBatterName} out. Team is all out!`);
  } else {
    if (type === 'Retired Hurt') {
      // Just mark retired
      if (whichBatter === 'striker') innings.striker = '';
      else innings.nonStriker = '';
    } else {
      // Input new batsman
      if (whichBatter === 'striker') {
        innings.striker = nextBatterName;
      } else {
        innings.nonStriker = nextBatterName;
      }
      innings.batters[nextBatterName] = { runs: 0, balls: 0, fours: 0, sixes: 0, status: 'batting' };
      announce(`Wicket! ${dismissedBatterName} out. ${nextBatterName} is the new batter.`);
    }
  }
  
  dialogWicketPicker.close();
  afterBallCheck(type === 'Retired Hurt' || isAllOut);
});

// Check Innings/Match statuses after each ball
function afterBallCheck(hasPromptedStateChange = false) {
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  const totalOvers = tournament.oversPerMatch;
  const inningsBallsMax = totalOvers * 6;
  
  let transitionOccurred = false;
  
  // Scenario A: Batting team is all out
  const isAllOut = innings.wickets >= tournament.wicketsPerInnings;
  
  // Scenario B: Completed designated overs
  const isOversCompleted = innings.balls >= inningsBallsMax;
  
  // Scenario C: Innings 2 - Target is chased down
  let isTargetChased = false;
  if (activeMatch.currentInnings === 2) {
    const innings1Runs = activeMatch.innings[0].runs;
    if (innings.runs > innings1Runs) {
      isTargetChased = true;
    }
  }
  
  // Handle end of innings / match
  if (isTargetChased) {
    endMatch();
    transitionOccurred = true;
  } else if (isAllOut || isOversCompleted) {
    if (activeMatch.currentInnings === 1) {
      endFirstInnings();
      transitionOccurred = true;
    } else {
      endMatch();
      transitionOccurred = true;
    }
  }
  
  // Handle standard Over End (and not in transition)
  if (!transitionOccurred && !hasPromptedStateChange && innings.balls > 0 && innings.balls % 6 === 0) {
    // If wide/no-ball re-bowl is enabled, innings.balls represents legal balls only.
    // If not, we still trigger at 6 balls.
    const lastOverIndex = innings.overTimeline.length;
    if (innings.overTimeline.length > 0) {
      endOver();
    }
  }
  
  saveState();
  updateScoringUI();
}

// End of Over transition
function endOver() {
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  
  // Rotate strike automatically on over completion (bowler bowls from opposite end)
  if (innings.striker && innings.nonStriker) {
    swapStrike(innings);
  }
  
  // Archive current over to list
  innings.oversList.push({
    bowler: innings.currentBowler,
    runs: innings.bowlers[innings.currentBowler].currentOverRuns,
    ballsTimeline: [...innings.overTimeline]
  });
  
  // Check for Maiden Over (0 runs and full 6 legal balls of bowler)
  const activeBowler = innings.bowlers[innings.currentBowler];
  if (activeBowler.currentOverRuns === 0) {
    activeBowler.maidens += 1;
  }
  
  // Reset bowler current over runs
  activeBowler.currentOverRuns = 0;
  
  // Reset timeline
  innings.overTimeline = [];
  
  // Prompt for new bowler
  document.getElementById('input-next-bowler').value = '';
  dialogSelectBowler.showModal();
}

dialogSelectBowler.addEventListener('submit', (e) => {
  const nextBowler = document.getElementById('input-next-bowler').value.trim();
  if (!nextBowler) return;
  
  const innings = activeMatch.innings[activeMatch.currentInnings - 1];
  innings.currentBowler = nextBowler;
  
  if (!innings.bowlers[nextBowler]) {
    innings.bowlers[nextBowler] = { balls: 0, runs: 0, wickets: 0, maidens: 0, currentOverRuns: 0 };
  }
  
  dialogSelectBowler.close();
  saveState();
  updateScoringUI();
  announce(`Over completed. New bowler: ${nextBowler}`);
});

// End Innings 1
function endFirstInnings() {
  const innings1 = activeMatch.innings[0];
  activeMatch.currentInnings = 2;
  
  announce(`Innings 1 finished. ${innings1.battingTeam} scored ${innings1.runs}/${innings1.wickets}. Target for ${activeMatch.teamB}: ${innings1.runs + 1}`);
  
  // Prompt batters for Innings 2
  document.getElementById('input-opener-striker').value = '';
  document.getElementById('input-opener-nonstriker').value = '';
  document.getElementById('input-opener-bowler').value = '';
  promptOpeners();
}

// End Match completely
function endMatch(forfeit = false, forfeitWinner = '') {
  activeMatch.status = 'completed';
  
  const inn1 = activeMatch.innings[0];
  const inn2 = activeMatch.innings[1];
  
  let victoryText = '';
  if (forfeit) {
    victoryText = `${forfeitWinner} won the match (Opponent forfeited)`;
  } else {
    if (inn2.runs > inn1.runs) {
      const wicketsLeft = tournament.wicketsPerInnings - inn2.wickets;
      victoryText = `${inn2.battingTeam} won by ${wicketsLeft} Wicket${wicketsLeft !== 1 ? 's' : ''}!`;
    } else if (inn1.runs > inn2.runs) {
      const runsMargin = inn1.runs - inn2.runs;
      victoryText = `${inn1.battingTeam} won by ${runsMargin} Run${runsMargin !== 1 ? 's' : ''}!`;
    } else {
      victoryText = `Match Tied! Both teams scored ${inn1.runs} runs.`;
    }
  }
  
  activeMatch.victoryMessage = victoryText;
  
  // Add to tournament list
  tournament.matches.push(deepCopy(activeMatch));
  activeMatch = null; // Clear active
  
  saveState();
  updateDashboardUI();
  showSummaryScreen(tournament.matches[tournament.matches.length - 1]);
}

// Forfeit/End Match prematurely
document.getElementById('btn-end-match-early').addEventListener('click', () => {
  if (!activeMatch) return;
  const ok = confirm("Are you sure you want to end this match prematurely?");
  if (!ok) return;
  
  const winner = prompt(`Select the winning team:\n1. ${activeMatch.teamA}\n2. ${activeMatch.teamB}\n3. Mark as Tie`, activeMatch.teamA);
  let winnerTeam = 'Tie';
  let forfeit = true;
  
  if (winner === '1' || winner === activeMatch.teamA) {
    winnerTeam = activeMatch.teamA;
  } else if (winner === '2' || winner === activeMatch.teamB) {
    winnerTeam = activeMatch.teamB;
  } else {
    forfeit = false;
  }
  
  endMatch(forfeit, winnerTeam);
});

// Undo handler
document.getElementById('btn-undo-trigger').addEventListener('click', () => {
  handleUndo();
});

function handleUndo() {
  if (!activeMatch || activeMatch.history.length === 0) {
    announce("No actions to undo.");
    return;
  }
  
  const prevState = activeMatch.history.pop();
  activeMatch.currentInnings = prevState.currentInnings;
  activeMatch.status = prevState.status;
  activeMatch.victoryMessage = prevState.victoryMessage;
  activeMatch.innings = prevState.innings;
  
  saveState();
  updateScoringUI();
  announce("Last action undone.");
}

// --- UI Updates ---

// Bind scoring run clicks dynamically
document.querySelectorAll('.btn-run').forEach(btn => {
  btn.addEventListener('click', () => {
    const runsVal = parseInt(btn.getAttribute('data-value'), 10);
    recordRuns(runsVal);
  });
});

document.getElementById('btn-wd').addEventListener('click', () => recordExtra('wide'));
document.getElementById('btn-nb').addEventListener('click', () => recordExtra('noball'));
document.getElementById('btn-by').addEventListener('click', () => recordExtra('bye'));
document.getElementById('btn-lb').addEventListener('click', () => recordExtra('legbye'));

function updateScoringUI() {
  if (!activeMatch) return;
  
  const currentInn = activeMatch.currentInnings;
  const innings = activeMatch.innings[currentInn - 1];
  
  // Scores
  document.getElementById('live-batting-team').textContent = innings.battingTeam;
  document.getElementById('live-innings-num').textContent = currentInn;
  document.getElementById('live-runs').textContent = innings.runs;
  document.getElementById('live-wickets').textContent = innings.wickets;
  
  const oversText = ballsToOvers(innings.balls);
  document.getElementById('live-overs').textContent = oversText;
  
  // CRR
  const completedOversFloat = (Math.floor(innings.balls / 6)) + ((innings.balls % 6) / 6);
  const crr = completedOversFloat > 0 ? (innings.runs / completedOversFloat).toFixed(2) : '0.00';
  document.getElementById('live-crr').textContent = crr;
  
  // Equation / Target
  const targetContainer = document.getElementById('live-target-container');
  const equationText = document.getElementById('live-match-equation');
  
  if (currentInn === 2) {
    targetContainer.classList.remove('hidden');
    const inn1 = activeMatch.innings[0];
    const target = inn1.runs + 1;
    document.getElementById('live-target').textContent = target;
    
    // RRR
    const maxBalls = tournament.oversPerMatch * 6;
    const remainingBalls = maxBalls - innings.balls;
    const runsNeeded = target - innings.runs;
    
    const rrr = remainingBalls > 0 ? ((runsNeeded / remainingBalls) * 6).toFixed(2) : '0.00';
    document.getElementById('live-rrr').textContent = rrr;
    
    equationText.textContent = `${innings.battingTeam} needs ${runsNeeded} run${runsNeeded !== 1 ? 's' : ''} in ${remainingBalls} ball${remainingBalls !== 1 ? 's' : ''} to win.`;
  } else {
    targetContainer.classList.add('hidden');
    equationText.textContent = `Batting First. Overs setup: ${tournament.oversPerMatch} ovs.`;
  }
  
  // Batter Striker
  const strikerRow = document.getElementById('batter-striker-row');
  if (innings.striker) {
    strikerRow.style.display = 'grid';
    document.getElementById('striker-name').textContent = innings.striker;
    
    const stats = innings.batters[innings.striker] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
    document.getElementById('striker-runs').textContent = stats.runs;
    document.getElementById('striker-balls').textContent = stats.balls;
    document.getElementById('striker-fours').textContent = stats.fours;
    document.getElementById('striker-sixes').textContent = stats.sixes;
    
    const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(1) : '0.0';
    document.getElementById('striker-sr').textContent = sr;
  } else {
    strikerRow.style.display = 'none';
  }
  
  // Batter Non-Striker
  const nonStrikerRow = document.getElementById('batter-nonstriker-row');
  if (innings.nonStriker) {
    nonStrikerRow.style.display = 'grid';
    document.getElementById('nonstriker-name').textContent = innings.nonStriker;
    
    const stats = innings.batters[innings.nonStriker] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
    document.getElementById('nonstriker-runs').textContent = stats.runs;
    document.getElementById('nonstriker-balls').textContent = stats.balls;
    document.getElementById('nonstriker-fours').textContent = stats.fours;
    document.getElementById('nonstriker-sixes').textContent = stats.sixes;
    
    const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(1) : '0.0';
    document.getElementById('nonstriker-sr').textContent = sr;
  } else {
    nonStrikerRow.style.display = 'none';
  }
  
  // Bowler
  if (innings.currentBowler) {
    document.getElementById('bowler-name').textContent = innings.currentBowler;
    const stats = innings.bowlers[innings.currentBowler] || { balls: 0, runs: 0, wickets: 0, maidens: 0 };
    
    document.getElementById('bowler-overs').textContent = ballsToOvers(stats.balls);
    document.getElementById('bowler-maidens').textContent = stats.maidens;
    document.getElementById('bowler-runs').textContent = stats.runs;
    document.getElementById('bowler-wickets').textContent = stats.wickets;
    
    const oversFloat = (Math.floor(stats.balls / 6)) + ((stats.balls % 6) / 6);
    const econ = oversFloat > 0 ? (stats.runs / oversFloat).toFixed(1) : '0.0';
    document.getElementById('bowler-econ').textContent = econ;
  }
  
  // Timeline of current over
  const timelineList = document.getElementById('over-balls-list');
  timelineList.innerHTML = '';
  innings.overTimeline.forEach(ball => {
    const badge = document.createElement('span');
    badge.className = 'ball-badge';
    badge.textContent = ball;
    
    if (ball === '4') badge.classList.add('run-4');
    else if (ball === '6') badge.classList.add('run-6');
    else if (ball === 'W') badge.classList.add('wicket');
    else if (ball.includes('Wd') || ball.includes('Nb') || ball.includes('B') || ball.includes('Lb')) {
      badge.classList.add('extra');
    }
    
    timelineList.appendChild(badge);
  });
  
  // Partnership & Extras info
  // Calculate partnership: since last wicket, find runs scored
  let lastWicketRuns = 0;
  if (innings.fallOfWickets.length > 0) {
    lastWicketRuns = innings.fallOfWickets[innings.fallOfWickets.length - 1].runs;
  }
  const currentPartnershipRuns = innings.runs - lastWicketRuns;
  
  // Count balls in partnership: balls faced by current active batters in their current innings
  let currentPartnershipBalls = 0;
  if (innings.striker && innings.batters[innings.striker]) {
    currentPartnershipBalls += innings.batters[innings.striker].balls;
  }
  if (innings.nonStriker && innings.batters[innings.nonStriker]) {
    currentPartnershipBalls += innings.batters[innings.nonStriker].balls;
  }
  
  document.getElementById('live-partnership').textContent = currentPartnershipRuns;
  document.getElementById('live-partnership-balls').textContent = currentPartnershipBalls;
  
  document.getElementById('live-extras-total').textContent = innings.extras.total;
  document.getElementById('live-extras-wd').textContent = innings.extras.wide;
  document.getElementById('live-extras-nb').textContent = innings.extras.noball;
  document.getElementById('live-extras-by').textContent = innings.extras.bye;
  document.getElementById('live-extras-lb').textContent = innings.extras.legbye;
  
  // Disable undo button if no history exists
  const undoBtn = document.getElementById('btn-undo-trigger');
  undoBtn.disabled = activeMatch.history.length === 0;
  undoBtn.style.opacity = activeMatch.history.length === 0 ? '0.5' : '1';
}

// Update Dashboard screen
function updateDashboardUI() {
  document.getElementById('dashboard-day-subtitle').textContent = tournament.dayName;
  
  // Stats
  document.getElementById('stat-matches-count').textContent = tournament.matches.length;
  
  let totalRuns = 0;
  const teamWins = {};
  const teamPlayed = {};
  
  tournament.matches.forEach(m => {
    // Sum total runs
    m.innings.forEach(inn => {
      totalRuns += inn.runs;
    });
    
    // Parse winner/losses
    const inn1 = m.innings[0];
    const inn2 = m.innings[1];
    
    // Register played
    teamPlayed[m.teamA] = (teamPlayed[m.teamA] || 0) + 1;
    teamPlayed[m.teamB] = (teamPlayed[m.teamB] || 0) + 1;
    
    if (m.victoryMessage.includes(m.teamA)) {
      teamWins[m.teamA] = (teamWins[m.teamA] || 0) + 1;
      teamWins[m.teamB] = teamWins[m.teamB] || 0;
    } else if (m.victoryMessage.includes(m.teamB)) {
      teamWins[m.teamB] = (teamWins[m.teamB] || 0) + 1;
      teamWins[m.teamA] = teamWins[m.teamA] || 0;
    }
  });
  
  document.getElementById('stat-total-runs').textContent = totalRuns;
  
  // Determine top team
  let topTeam = '-';
  let maxWins = -1;
  Object.entries(teamWins).forEach(([team, wins]) => {
    if (wins > maxWins) {
      maxWins = wins;
      topTeam = team;
    }
  });
  document.getElementById('stat-top-team').textContent = topTeam === '-' ? '-' : `${topTeam} (${maxWins} Wins)`;
  
  // Render Standings Table
  const tbody = document.getElementById('standings-table-body');
  tbody.innerHTML = '';
  
  // Unique list of all teams who played today
  const allTeams = [...new Set([...Object.keys(teamPlayed)])];
  
  allTeams.forEach(team => {
    const played = teamPlayed[team] || 0;
    const won = teamWins[team] || 0;
    const lost = played - won;
    const pct = played > 0 ? ((won / played) * 100).toFixed(0) + '%' : '0%';
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${team}</strong></td>
      <td>${played}</td>
      <td>${won}</td>
      <td>${lost}</td>
      <td>${pct}</td>
    `;
    tbody.appendChild(row);
  });
  
  if (allTeams.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="5" class="text-center" style="color: var(--text-muted)">No team statistics available yet.</td>`;
    tbody.appendChild(row);
  }
  
  // Render Match List
  const listContainer = document.getElementById('match-list');
  listContainer.innerHTML = '';
  
  if (tournament.matches.length === 0) {
    listContainer.innerHTML = `<p class="empty-state">No matches played yet. Click "New Match" to start!</p>`;
  } else {
    // Show match list in reverse order (newest first)
    [...tournament.matches].reverse().forEach((match, idx) => {
      const inn1 = match.innings[0];
      const inn2 = match.innings[1];
      
      const item = document.createElement('div');
      item.className = 'match-item glass';
      item.innerHTML = `
        <div>
          <div class="match-item-teams">${match.teamA} vs ${match.teamB}</div>
          <div class="match-item-result">${match.victoryMessage}</div>
        </div>
        <div class="match-item-scores">
          <div class="match-score-runs">${inn1.runs}/${inn1.wickets} <span style="font-size: 0.8rem; font-weight:400; color:var(--text-secondary)">vs</span> ${inn2.runs}/${inn2.wickets}</div>
          <div class="match-score-overs">${ballsToOvers(inn1.balls)} ovs & ${ballsToOvers(inn2.balls)} ovs</div>
        </div>
      `;
      // Click to open completion details
      item.addEventListener('click', () => {
        showSummaryScreen(match);
      });
      listContainer.appendChild(item);
    });
  }
}

// Show Summary/Completion Screen for a completed match
let viewingMatch = null;

function showSummaryScreen(match) {
  viewingMatch = match;
  showScreen('summary');
  
  document.getElementById('match-victory-banner').textContent = match.victoryMessage;
  
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];
  
  // Summary boxes
  document.getElementById('summary-team-a-name').textContent = inn1.battingTeam;
  document.getElementById('summary-team-a-score').textContent = `${inn1.runs}/${inn1.wickets} (${ballsToOvers(inn1.balls)} Ovs)`;
  
  document.getElementById('summary-team-b-name').textContent = inn2.battingTeam;
  document.getElementById('summary-team-b-score').textContent = `${inn2.runs}/${inn2.wickets} (${ballsToOvers(inn2.balls)} Ovs)`;
  
  // Update Visual Card Preview
  document.getElementById('card-match-title').textContent = `${match.teamA.toUpperCase()} vs ${match.teamB.toUpperCase()}`;
  document.getElementById('card-victory-msg').textContent = match.victoryMessage;
  
  document.getElementById('card-team1-name').textContent = inn1.battingTeam.substring(0, 10).toUpperCase();
  document.getElementById('card-team1-runs').textContent = `${inn1.runs}/${inn1.wickets}`;
  document.getElementById('card-team1-overs').textContent = `${ballsToOvers(inn1.balls)} Ovs`;
  
  document.getElementById('card-team2-name').textContent = inn2.battingTeam.substring(0, 10).toUpperCase();
  document.getElementById('card-team2-runs').textContent = `${inn2.runs}/${inn2.wickets}`;
  document.getElementById('card-team2-overs').textContent = `${ballsToOvers(inn2.balls)} Ovs`;
  
  // Find top performers for the card
  let bestBatter = '-';
  let bestBatRuns = -1;
  let bestBowler = '-';
  let bestBowlWickets = -1;
  let bestBowlRuns = 999;
  
  // Search batsman across both innings
  match.innings.forEach(inn => {
    Object.entries(inn.batters).forEach(([name, stats]) => {
      if (stats.runs > bestBatRuns) {
        bestBatRuns = stats.runs;
        bestBatter = `${name} ${stats.runs}(${stats.balls})`;
      }
    });
    
    Object.entries(inn.bowlers).forEach(([name, stats]) => {
      // Prioritize wickets, then economy/runs conceded
      if (stats.wickets > bestBowlWickets || (stats.wickets === bestBowlWickets && stats.runs < bestBowlRuns)) {
        bestBowlWickets = stats.wickets;
        bestBowlRuns = stats.runs;
        bestBowler = `${name} ${stats.wickets}/${stats.runs} (${ballsToOvers(stats.balls)} ov)`;
      }
    });
  });
  
  document.getElementById('card-best-bat').textContent = bestBatter;
  document.getElementById('card-best-bowl').textContent = bestBowler;
}

// Back to Dashboard button
document.getElementById('btn-back-dashboard').addEventListener('click', () => {
  viewingMatch = null;
  updateDashboardUI();
  showScreen('dashboard');
});

// --- Share Utilities ---

// WhatsApp Match share
document.getElementById('btn-share-whatsapp').addEventListener('click', () => {
  if (!viewingMatch) return;
  const txt = generateMatchTextSummary(viewingMatch);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`;
  window.open(url, '_blank');
});

// Copy Match text
document.getElementById('btn-copy-text').addEventListener('click', () => {
  if (!viewingMatch) return;
  const txt = generateMatchTextSummary(viewingMatch);
  navigator.clipboard.writeText(txt).then(() => {
    announce("Text scorecard copied to clipboard!");
    alert("Scorecard copied!");
  });
});

// Text summary generator for Whatsapp/Clipboard
function generateMatchTextSummary(match) {
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];
  
  let text = `🏏 *MATCH SCORECARD* 🏏\n`;
  text += `*${match.teamA} vs ${match.teamB}*\n\n`;
  text += `🏆 *Result:* ${match.victoryMessage}\n\n`;
  
  text += `*1st Innings: ${inn1.battingTeam}*\n`;
  text += `Runs: *${inn1.runs}/${inn1.wickets}* (${ballsToOvers(inn1.balls)} overs)\n`;
  text += `Extras: ${inn1.extras.total} (Wd:${inn1.extras.wide}, Nb:${inn1.extras.noball})\n\n`;
  
  text += `*2nd Innings: ${inn2.battingTeam}*\n`;
  text += `Runs: *${inn2.runs}/${inn2.wickets}* (${ballsToOvers(inn2.balls)} overs)\n`;
  text += `Extras: ${inn2.extras.total} (Wd:${inn2.extras.wide}, Nb:${inn2.extras.noball})\n\n`;
  
  // Highlight top performers
  let bestBatters = [];
  let bestBowlers = [];
  
  match.innings.forEach(inn => {
    // Batting highlights (> 10 runs)
    Object.entries(inn.batters).forEach(([name, stats]) => {
      if (stats.runs >= 10) {
        bestBatters.push(`${name} ${stats.runs}(${stats.balls})`);
      }
    });
    // Bowling highlights (> 1 wicket or tidy over)
    Object.entries(inn.bowlers).forEach(([name, stats]) => {
      if (stats.wickets > 0 || stats.balls >= 6) {
        bestBowlers.push(`${name} ${stats.wickets}/${stats.runs} (${ballsToOvers(stats.balls)})`);
      }
    });
  });
  
  if (bestBatters.length > 0) {
    text += `🔥 *Key Batting:* \n${bestBatters.map(b => `• ${b}`).join('\n')}\n\n`;
  }
  if (bestBowlers.length > 0) {
    text += `🎯 *Key Bowling:* \n${bestBowlers.map(b => `• ${b}`).join('\n')}\n\n`;
  }
  
  text += `Scored on Turf Cricket App.`;
  return text;
}

// Share full day tournament summary
document.getElementById('btn-share-day').addEventListener('click', () => {
  if (tournament.matches.length === 0) {
    announce("No matches played yet today.");
    return;
  }
  
  let txt = `🏆 *TURF CRICKET TOURNAMENT SUMMARY* 🏆\n`;
  txt += `📅 *Session:* ${tournament.dayName}\n`;
  txt += `Matches played: ${tournament.matches.length}\n\n`;
  
  // Standings win summary
  txt += `📋 *Standings:*\n`;
  const teamWins = {};
  const teamPlayed = {};
  
  tournament.matches.forEach(m => {
    teamPlayed[m.teamA] = (teamPlayed[m.teamA] || 0) + 1;
    teamPlayed[m.teamB] = (teamPlayed[m.teamB] || 0) + 1;
    
    if (m.victoryMessage.includes(m.teamA)) {
      teamWins[m.teamA] = (teamWins[m.teamA] || 0) + 1;
    } else if (m.victoryMessage.includes(m.teamB)) {
      teamWins[m.teamB] = (teamWins[m.teamB] || 0) + 1;
    }
  });
  
  Object.keys(teamPlayed).forEach(team => {
    const wins = teamWins[team] || 0;
    txt += `• *${team}:* Wins: ${wins} / Played: ${teamPlayed[team]}\n`;
  });
  txt += `\n`;
  
  // List matches
  txt += `⚔️ *Match Summaries:*\n`;
  tournament.matches.forEach((m, idx) => {
    const inn1 = m.innings[0];
    const inn2 = m.innings[1];
    txt += `*Match ${idx + 1}:* ${m.teamA} vs ${m.teamB}\n`;
    txt += `Score: ${inn1.runs}/${inn1.wickets} vs ${inn2.runs}/${inn2.wickets}\n`;
    txt += `Result: _${m.victoryMessage}_\n\n`;
  });
  
  txt += `Scored on Turf Cricket App.`;
  
  // Use web share if available
  if (navigator.share) {
    navigator.share({
      title: `${tournament.dayName} Summary`,
      text: txt
    }).catch(console.error);
  } else {
    // Copy fallback
    navigator.clipboard.writeText(txt).then(() => {
      announce("Day tournament summary copied to clipboard!");
      alert("Session summary copied!");
    });
  }
});

// Canvas rendering to download visually appealing scorecard image
document.getElementById('btn-download-image').addEventListener('click', () => {
  if (!viewingMatch) return;
  downloadCardImage(viewingMatch);
});

function downloadCardImage(match) {
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];
  
  // Set up canvas sizing (ratio appropriate for social sharing)
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  
  // 1. Draw background gradient
  const grad = ctx.createLinearGradient(0, 0, 600, 600);
  grad.addColorStop(0, '#0f172a'); // slate-900
  grad.addColorStop(0.5, '#064e3b'); // emerald-900
  grad.addColorStop(1, '#022c22'); // dark green
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 600);
  
  // Draw subtle boundary borders
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 580, 580);
  
  // 2. Draw Logo/Header
  ctx.fillStyle = '#10b981'; // emerald-500
  ctx.font = 'bold 16px Outfit, sans-serif';
  ctx.fillText('🏏 TURF CRICKET SCORECARD', 40, 50);
  
  // Session details
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '14px Outfit, sans-serif';
  ctx.fillText(tournament.dayName || 'Turf Session', 40, 75);
  
  // 3. Draw Match Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Outfit, sans-serif';
  ctx.fillText(`${match.teamA.toUpperCase()} vs ${match.teamB.toUpperCase()}`, 40, 120);
  
  // 4. Draw Victory/Result Banner
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.fillRect(40, 145, 520, 50);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 145, 520, 50);
  
  ctx.fillStyle = '#34d399'; // light green
  ctx.font = 'bold 18px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(match.victoryMessage, 300, 176);
  ctx.textAlign = 'left'; // reset
  
  // 5. Draw Scores Box
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(40, 220, 520, 140);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.strokeRect(40, 220, 520, 140);
  
  // Team 1 score column
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = 'bold 13px Outfit, sans-serif';
  ctx.fillText(inn1.battingTeam.toUpperCase(), 70, 255);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'extrabold 36px Outfit, sans-serif';
  ctx.fillText(`${inn1.runs}/${inn1.wickets}`, 70, 300);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '14px Outfit, sans-serif';
  ctx.fillText(`${ballsToOvers(inn1.balls)} Overs`, 70, 330);
  
  // VS
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = 'bold 20px Outfit, sans-serif';
  ctx.fillText('VS', 285, 290);
  
  // Team 2 score column
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = 'bold 13px Outfit, sans-serif';
  ctx.fillText(inn2.battingTeam.toUpperCase(), 370, 255);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'extrabold 36px Outfit, sans-serif';
  ctx.fillText(`${inn2.runs}/${inn2.wickets}`, 370, 300);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '14px Outfit, sans-serif';
  ctx.fillText(`${ballsToOvers(inn2.balls)} Overs`, 370, 330);
  
  // 6. Top Performers Box
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(40, 385, 520, 130);
  ctx.strokeRect(40, 385, 520, 130);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = 'bold 12px Outfit, sans-serif';
  ctx.fillText('TOP PERFORMERS TODAY', 60, 415);
  
  // Find top performers again
  let bestBatText = '-';
  let bestBatRuns = -1;
  let bestBowlText = '-';
  let bestBowlWickets = -1;
  let bestBowlRuns = 999;
  
  match.innings.forEach(inn => {
    Object.entries(inn.batters).forEach(([name, stats]) => {
      if (stats.runs > bestBatRuns) {
        bestBatRuns = stats.runs;
        bestBatText = `${name}   ${stats.runs} runs off ${stats.balls} balls`;
      }
    });
    Object.entries(inn.bowlers).forEach(([name, stats]) => {
      if (stats.wickets > bestBowlWickets || (stats.wickets === bestBowlWickets && stats.runs < bestBowlRuns)) {
        bestBowlWickets = stats.wickets;
        bestBowlRuns = stats.runs;
        bestBowlText = `${name}   ${stats.wickets} wickets for ${stats.runs} runs (${ballsToOvers(stats.balls)} ov)`;
      }
    });
  });
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px Outfit, sans-serif';
  ctx.fillText('Batting:', 60, 448);
  ctx.fillText('Bowling:', 60, 485);
  
  ctx.fillStyle = '#34d399';
  ctx.font = '500 15px Outfit, sans-serif';
  ctx.fillText(bestBatText, 140, 448);
  ctx.fillText(bestBowlText, 140, 485);
  
  // Footer credit text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '12px Outfit, sans-serif';
  ctx.fillText('Generated via Turf Cricket App', 40, 560);
  ctx.textAlign = 'right';
  ctx.fillText('2026 Season', 560, 560);
  
  // Trigger download of the canvas as image
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `scorecard_${match.teamA}_vs_${match.teamB}.png`;
  a.click();
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadState();
  
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker: Registered'))
        .catch(err => console.log('Service Worker: Error', err));
    });
  }
});
